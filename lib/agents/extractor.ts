import { MODELS } from "@/lib/models";
import {
  anthropic,
  costFromUsage,
  normalizeUsage,
  stripJsonFence,
  traceHeaders,
  type TraceMeta,
} from "./client";
import { RequirementsSchema, type AgentTrace, type Requirements } from "./types";

const STEP = "requirements_extractor";

const SYSTEM = `You extract structured requirements from a job description.

Return ONLY a JSON object matching this exact shape (no prose, no markdown):
{
  "company_name": string,
  "role_title": string,
  "seniority_signals": string[],
  "must_have_skills": string[],
  "nice_to_have_skills": string[],
  "key_responsibilities": string[],
  "tone_indicators": string[]
}

Rules:
- company_name and role_title must be non-empty. If unclear, infer the most likely value from the text rather than leaving blank.
- seniority_signals: phrases like "5+ years", "senior", "staff", "lead", "tech lead".
- must_have_skills vs nice_to_have_skills: split on phrases like "required", "must have" vs "bonus", "nice to have", "preferred".
- key_responsibilities: 3-6 short phrases summarizing day-to-day work.
- tone_indicators: 2-4 adjectives describing the company voice in the posting (e.g. "direct", "playful", "formal").
- Skill lists are arrays of short strings (e.g. "TypeScript", "Postgres"), not full sentences.`;

export type ExtractorResult = { data: Requirements; trace: AgentTrace };

export async function extractRequirements(jd: string, meta: TraceMeta): Promise<ExtractorResult> {
  const t0 = Date.now();
  let retries = 0;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await anthropic().messages.create(
      {
        model: MODELS.extractor,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: `<job_description>\n${jd}\n</job_description>` }],
      },
      { headers: traceHeaders({ ...meta, step: STEP }) },
    );

    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    try {
      const json = JSON.parse(stripJsonFence(text));
      const data = RequirementsSchema.parse(json);
      const usage = normalizeUsage(resp.usage);
      return {
        data,
        trace: {
          step: STEP,
          model: MODELS.extractor,
          latency_ms: Date.now() - t0,
          cost_usd: costFromUsage(MODELS.extractor, usage),
          retries,
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      retries++;
    }
  }

  throw new Error(`extractor: failed to produce valid JSON after retry — ${lastError?.message}`);
}
