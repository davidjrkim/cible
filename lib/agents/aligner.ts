import { MODELS } from "@/lib/models";
import { AI_TELL_INSTRUCTION } from "@/lib/ai-tells";
import {
  anthropic,
  costFromUsage,
  normalizeUsage,
  stripJsonFence,
  traceHeaders,
  type TraceMeta,
} from "./client";
import { BulletsSchema, type AgentTrace, type Bullets, type Requirements } from "./types";

const STEP = "cv_aligner";

const BASE_SYSTEM = `You rewrite a candidate's CV into 4-6 tailored bullets that map directly to a specific job description.

Return ONLY a JSON object matching this exact shape (no prose, no markdown):
{
  "bullets": [
    { "text": string, "addresses_requirement": string, "cv_evidence_span": string }
  ]
}

Hard rules:
- DO NOT invent experience, employers, projects, metrics, or skills the candidate does not have. Every claim must be supported by the CV.
- "text" is the rewritten bullet (one sentence, ≤30 words, ideally with a metric).
- "addresses_requirement" is one of the must_have_skills or key_responsibilities from the structured JD.
- "cv_evidence_span" is a verbatim substring of the raw CV (copy-paste exact) supporting the claim.
- Output 4-6 bullets. Prefer impact and concrete numbers from the CV over generic phrasing.
- Match the tone_indicators in the structured JD (e.g. "direct" → no hype words).`;

export type AlignerResult = { data: Bullets; trace: AgentTrace };

export async function alignCv(
  args: { requirements: Requirements; cv: string; retryFeedback?: string; removeAiTells?: boolean },
  meta: TraceMeta,
): Promise<AlignerResult> {
  const system = args.removeAiTells ? `${BASE_SYSTEM}\n\n${AI_TELL_INSTRUCTION}` : BASE_SYSTEM;
  const t0 = Date.now();
  let retries = 0;
  let lastError: Error | null = null;

  const baseContent = [
    {
      type: "text" as const,
      text: `<raw_cv>\n${args.cv}\n</raw_cv>`,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: `<structured_jd>\n${JSON.stringify(args.requirements, null, 2)}\n</structured_jd>`,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: args.retryFeedback
        ? `<feedback>\nThe previous attempt had unsupported claims:\n${args.retryFeedback}\nRemove or rephrase to stay grounded in the CV.\n</feedback>`
        : "Produce the JSON now.",
    },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await anthropic().messages.create(
      {
        model: MODELS.writer,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: baseContent }],
      },
      { headers: traceHeaders({ ...meta, step: STEP }) },
    );

    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    try {
      const json = JSON.parse(stripJsonFence(text));
      const data = BulletsSchema.parse(json);
      const usage = normalizeUsage(resp.usage);
      return {
        data,
        trace: {
          step: STEP,
          model: MODELS.writer,
          latency_ms: Date.now() - t0,
          cost_usd: costFromUsage(MODELS.writer, usage),
          retries,
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      retries++;
    }
  }

  throw new Error(`aligner: failed to produce valid JSON after retry — ${lastError?.message}`);
}
