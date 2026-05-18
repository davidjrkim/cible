import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@/lib/models";

const HELICONE_BASE_URL = "https://anthropic.helicone.ai";

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const heliconeKey = process.env.HELICONE_API_KEY;
  const useHelicone = !!heliconeKey;

  _client = new Anthropic({
    apiKey,
    baseURL: useHelicone ? HELICONE_BASE_URL : undefined,
    defaultHeaders: useHelicone ? { "Helicone-Auth": `Bearer ${heliconeKey}` } : undefined,
  });
  return _client;
}

export type TraceMeta = { traceId: string; step: string };

export function traceHeaders(meta: TraceMeta): Record<string, string> {
  return {
    "Helicone-Property-Trace-Id": meta.traceId,
    "Helicone-Property-Step": meta.step,
  };
}

// Per-million-token pricing (USD). Sources: Anthropic public pricing as of 2026-05.
const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // extractor and verifierClaimExtractor are both Haiku → one entry covers both.
  [MODELS.extractor]: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  [MODELS.writer]: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

export function costFromUsage(model: string, u: Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      u.cache_read_input_tokens * p.cacheRead +
      u.cache_creation_input_tokens * p.cacheWrite) /
    1_000_000
  );
}

export function normalizeUsage(raw: {
  input_tokens?: number | null;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}): Usage {
  return {
    input_tokens: raw.input_tokens ?? 0,
    output_tokens: raw.output_tokens ?? 0,
    cache_creation_input_tokens: raw.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: raw.cache_read_input_tokens ?? 0,
  };
}

/**
 * Strip a single fenced ```json ... ``` (or plain ```) wrapper if present.
 * Writers occasionally wrap JSON despite instructions; parsing is more robust
 * when we tolerate the common mistake rather than failing closed.
 */
export function stripJsonFence(s: string): string {
  const m = s.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : s.trim();
}
