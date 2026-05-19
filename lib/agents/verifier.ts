import { z } from "zod";
import { MODELS } from "@/lib/models";
import {
  costFromUsage,
  generate,
  llm,
  stripJsonFence,
  withRpmRetry,
  type TraceMeta,
} from "./client";
import type { AgentTrace, Bullets, CoverLetter } from "./types";

const CLAIM_STEP = "verifier_claim_extractor";
const VERIFIER_STEP = "groundedness_verifier";

// Threshold from PRD §6 / §7. Calibrate against the eval set; the verifier
// is a strong filter, not a proof.
export const COSINE_THRESHOLD = 0.75;
export const JACCARD_THRESHOLD = 0.6;

// NVIDIA NIM embeddings are credit-based on the free tier; no published
// per-token rate. Set to 0 so cost_usd surfaces honestly as $0 when free.
const EMBED_PRICING_INPUT = 0;

export const ClaimsSchema = z.object({
  bullets_claims: z.array(z.string()),
  cover_letter_claims: z.array(z.string()),
});
export type Claims = z.infer<typeof ClaimsSchema>;

export type GroundednessVerdict = { pass: boolean; unsupported_claims: string[] };
export type VerifierResult = {
  bullets: GroundednessVerdict;
  cover_letter: GroundednessVerdict;
  traces: AgentTrace[];
};

const CLAIM_SYSTEM = `You extract factual claims a candidate makes about themselves from generated job-application copy.

A "claim" is a discrete assertion about the candidate that could be true or false: a skill ("Rust"), an employer ("worked at Stripe"), a duration ("5 years of"), a project ("built a payments ledger"), an achievement ("cut p99 by 40%"). Tone, opinion, or generic statements are NOT claims.

Return ONLY a JSON object of this exact shape (no prose, no markdown):
{
  "bullets_claims": string[],
  "cover_letter_claims": string[]
}

Each claim is the literal phrase as it appears in the source (verbatim substring). Do not paraphrase.`;

export async function extractClaims(
  args: { bullets: Bullets["bullets"]; coverLetter: string },
  meta: TraceMeta,
): Promise<{ data: Claims; trace: AgentTrace }> {
  const t0 = Date.now();
  let retries = 0;
  let lastError: Error | null = null;

  const userText =
    `<bullets>\n${args.bullets.map((b) => `- ${b.text}`).join("\n")}\n</bullets>\n\n` +
    `<cover_letter>\n${args.coverLetter}\n</cover_letter>`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await generate(
      {
        model: MODELS.verifierClaimExtractor,
        system: CLAIM_SYSTEM,
        userText,
        maxOutputTokens: 1024,
      },
      { ...meta, step: CLAIM_STEP },
    );

    try {
      const json = JSON.parse(stripJsonFence(resp.text));
      const data = ClaimsSchema.parse(json);
      return {
        data,
        trace: {
          step: CLAIM_STEP,
          model: MODELS.verifierClaimExtractor,
          latency_ms: Date.now() - t0,
          cost_usd: costFromUsage(MODELS.verifierClaimExtractor, resp.usage),
          retries,
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      retries++;
    }
  }
  throw new Error(`verifier_claim_extractor: failed to produce valid JSON — ${lastError?.message}`);
}

// --- deterministic matchers ------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function substringMatch(claim: string, cv: string): boolean {
  return normalize(cv).includes(normalize(claim));
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "with",
  "at", "by", "from", "is", "was", "are", "were", "be", "been", "as",
  "that", "this", "these", "those", "it", "its", "i", "we", "our",
]);

function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(/[^a-z0-9+#.]+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

export function jaccardMatch(claim: string, cv: string): boolean {
  const a = tokens(claim);
  if (a.size === 0) return false;
  const b = tokens(cv);
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 && inter / a.size >= JACCARD_THRESHOLD;
}

// Split CV into rough ~3-sentence chunks for embedding comparison.
export function chunkCv(cv: string): string[] {
  const sentences = cv
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    chunks.push(sentences.slice(i, i + 3).join(" "));
  }
  return chunks.length ? chunks : [cv];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

async function embed(
  inputs: string[],
  inputType: "query" | "passage",
): Promise<{ vectors: number[][]; tokens: number }> {
  if (inputs.length === 0) return { vectors: [], tokens: 0 };
  const resp = await withRpmRetry(`nvidia-embed`, () =>
    llm().embeddings.create(
      {
        model: MODELS.embedding,
        input: inputs,
        // NVIDIA NV-Embed models require input_type; not in OpenAI's typed
        // schema, so pass it through and cast.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ input_type: inputType, truncate: "END" } as any),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      undefined as any,
    ),
  );
  return {
    vectors: resp.data.map((d) => d.embedding as number[]),
    tokens: resp.usage?.prompt_tokens ?? 0,
  };
}

// --- top-level verifier ----------------------------------------------------

export async function verifyGroundedness(
  args: { bullets: Bullets; coverLetter: CoverLetter; cv: string },
  meta: TraceMeta,
): Promise<VerifierResult> {
  const t0 = Date.now();
  const traces: AgentTrace[] = [];

  const claimsResult = await extractClaims(
    { bullets: args.bullets.bullets, coverLetter: args.coverLetter.cover_letter },
    meta,
  );
  traces.push(claimsResult.trace);

  const bulletsClaims = claimsResult.data.bullets_claims;
  const coverClaims = claimsResult.data.cover_letter_claims;

  // Tier 1+2: substring then Jaccard, no API calls.
  const stillUnresolved: { source: "bullets" | "cover_letter"; claim: string }[] = [];
  const bulletsUnsupported: string[] = [];
  const coverUnsupported: string[] = [];

  for (const c of bulletsClaims) {
    if (substringMatch(c, args.cv) || jaccardMatch(c, args.cv)) continue;
    stillUnresolved.push({ source: "bullets", claim: c });
  }
  for (const c of coverClaims) {
    if (substringMatch(c, args.cv) || jaccardMatch(c, args.cv)) continue;
    stillUnresolved.push({ source: "cover_letter", claim: c });
  }

  // Tier 3: embeddings against ~3-sentence CV chunks. Skip if no NVIDIA key
  // (treat as unsupported — the deterministic tiers already had a shot).
  // If the embedding API errors (quota, network, model unavailable), degrade
  // to the deterministic fallback instead of crashing the whole request.
  let embedCost = 0;
  let embedUsed = false;
  let embedError: string | null = null;
  if (stillUnresolved.length > 0 && process.env.NVIDIA_API_KEY) {
    try {
      const chunks = chunkCv(args.cv);
      const claimsToEmbed = stillUnresolved.map((u) => u.claim);
      const { vectors: chunkVecs, tokens: chunkTokens } = await embed(chunks, "passage");
      const { vectors: claimVecs, tokens: claimTokens } = await embed(claimsToEmbed, "query");
      embedCost = ((chunkTokens + claimTokens) * EMBED_PRICING_INPUT) / 1_000_000;
      embedUsed = true;

      for (let i = 0; i < stillUnresolved.length; i++) {
        const cv = claimVecs[i];
        let max = 0;
        for (const v of chunkVecs) {
          const s = cosine(cv, v);
          if (s > max) max = s;
        }
        if (max < COSINE_THRESHOLD) {
          const u = stillUnresolved[i];
          if (u.source === "bullets") bulletsUnsupported.push(u.claim);
          else coverUnsupported.push(u.claim);
        }
      }
    } catch (err) {
      embedError = err instanceof Error ? err.message : String(err);
      console.warn(`verifier: embedding fallback (deterministic) — ${embedError}`);
    }
  }

  if (!embedUsed) {
    for (const u of stillUnresolved) {
      if (u.source === "bullets") bulletsUnsupported.push(u.claim);
      else coverUnsupported.push(u.claim);
    }
  }

  traces.push({
    step: VERIFIER_STEP,
    model: embedUsed ? MODELS.embedding : "deterministic",
    latency_ms: Date.now() - t0 - claimsResult.trace.latency_ms,
    cost_usd: embedCost,
    retries: 0,
  });

  return {
    bullets: { pass: bulletsUnsupported.length === 0, unsupported_claims: bulletsUnsupported },
    cover_letter: { pass: coverUnsupported.length === 0, unsupported_claims: coverUnsupported },
    traces,
  };
}
