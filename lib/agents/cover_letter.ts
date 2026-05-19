import { MODELS } from "@/lib/models";
import { AI_TELL_INSTRUCTION } from "@/lib/ai-tells";
import {
  costFromUsage,
  generate,
  stripJsonFence,
  type TraceMeta,
} from "./client";
import { CoverLetterSchema, type AgentTrace, type CoverLetter, type Requirements } from "./types";

const STEP = "cover_letter_writer";

const BASE_SYSTEM = `You write a tailored 150-200 word cover letter for a specific role.

Return ONLY a JSON object matching this exact shape (no prose, no markdown):
{
  "cover_letter": string,
  "cv_evidence_spans": string[]
}

Hard rules:
- The opening hook MUST reference something specific to the company, pulled from the structured JD (a product, a stated value, a stack choice). NO generic "I am excited about your mission".
- DO NOT invent experience the candidate does not have. Every factual claim about the candidate must be backed by the CV.
- Length: 150-200 words.
- Match the tone_indicators in the structured JD.
- "cv_evidence_spans" is an array of verbatim substrings from the raw CV (copy-paste exact) supporting each factual claim the letter makes about the candidate. One span per claim.`;

export type CoverLetterResult = { data: CoverLetter; trace: AgentTrace };

export async function writeCoverLetter(
  args: { requirements: Requirements; cv: string; retryFeedback?: string; removeAiTells?: boolean },
  meta: TraceMeta,
): Promise<CoverLetterResult> {
  const system = args.removeAiTells ? `${BASE_SYSTEM}\n\n${AI_TELL_INSTRUCTION}` : BASE_SYSTEM;
  const t0 = Date.now();
  let retries = 0;
  let lastError: Error | null = null;

  const userText =
    `<raw_cv>\n${args.cv}\n</raw_cv>\n\n` +
    `<structured_jd>\n${JSON.stringify(args.requirements, null, 2)}\n</structured_jd>\n\n` +
    (args.retryFeedback
      ? `<feedback>\nThe previous attempt had unsupported claims:\n${args.retryFeedback}\nRemove or rephrase to stay grounded in the CV.\n</feedback>`
      : "Produce the JSON now.");

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await generate(
      {
        model: MODELS.writer,
        system,
        userText,
        maxOutputTokens: 1500,
      },
      { ...meta, step: STEP },
    );

    try {
      const json = JSON.parse(stripJsonFence(resp.text));
      const data = CoverLetterSchema.parse(json);
      return {
        data,
        trace: {
          step: STEP,
          model: MODELS.writer,
          latency_ms: Date.now() - t0,
          cost_usd: costFromUsage(MODELS.writer, resp.usage),
          retries,
        },
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      retries++;
    }
  }

  throw new Error(`cover_letter: failed to produce valid JSON after retry — ${lastError?.message}`);
}
