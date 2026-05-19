import OpenAI from "openai";

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

let _client: OpenAI | null = null;

export function llm(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set");
  _client = new OpenAI({ apiKey, baseURL: NVIDIA_BASE_URL });
  return _client;
}

export type TraceMeta = { traceId: string; step: string };

// NVIDIA NIM is credit-based on the free tier; we don't have stable
// per-token pricing to surface. Leave PRICING empty so cost_usd reports 0.
// Populate this if you switch to paid/enterprise NIM and have a rate card.
const PRICING: Record<string, { input: number; output: number }> = {};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
};

export function costFromUsage(model: string, u: Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (u.input_tokens * p.input + u.output_tokens * p.output) / 1_000_000;
}

export function stripJsonFence(s: string): string {
  const t = s.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const unfenced = fenced ? fenced[1].trim() : t;
  // Some hosted Llama variants prefix/suffix the JSON with stray text despite
  // the response_format hint. Slice to the outermost { ... } if present.
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first >= 0 && last > first) return unfenced.slice(first, last + 1);
  return unfenced;
}

export type GenerateParams = {
  model: string;
  system: string;
  userText: string;
  maxOutputTokens: number;
};

export type GenerateResult = {
  text: string;
  usage: Usage;
};

// Wraps an NVIDIA API call so transient 429s (free-tier RPM caps) don't blow
// up the whole request. Retries up to twice with linear backoff.
export async function withRpmRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = /429|rate.?limit|too.?many.?requests|resource.?exhausted/i.test(msg);
      if (!is429 || attempt === 2) throw err;
      const delaySec = 5 * (attempt + 1);
      console.warn(`${label}: 429, retrying in ${delaySec}s (attempt ${attempt + 1}/2)`);
      await new Promise((r) => setTimeout(r, delaySec * 1000));
    }
  }
  throw new Error("withRpmRetry: unreachable");
}

export async function generate(params: GenerateParams, _meta: TraceMeta): Promise<GenerateResult> {
  const resp = await withRpmRetry(`nvidia[${params.model}]`, () =>
    llm().chat.completions.create({
      model: params.model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.userText },
      ],
      max_tokens: params.maxOutputTokens,
      temperature: 0.2,
      // Honored by some NIM models, ignored by others. Our prompts already
      // enforce JSON, and stripJsonFence handles stray wrapping.
      response_format: { type: "json_object" },
    }),
  );
  const text = resp.choices[0]?.message?.content ?? "";
  return {
    text,
    usage: {
      input_tokens: resp.usage?.prompt_tokens ?? 0,
      output_tokens: resp.usage?.completion_tokens ?? 0,
    },
  };
}
