import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import type { Case } from "./cases.ts";
import type { PipelineOutputs } from "./pipeline.ts";

const JUDGE_PROMPT_PATH = join(import.meta.dirname, "judge_prompt.md");
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const JUDGE_MODEL_PRIMARY = "meta/llama-3.3-70b-instruct";
const JUDGE_MODEL_FALLBACK = "meta/llama-3.1-70b-instruct";

export type JudgeVerdict = {
  judge_model: string;
  scores: {
    bullets: { relevance: number; specificity: number };
    cover_letter: { relevance: number; specificity: number };
    questions: { relevance: number; specificity: number };
  };
  groundedness: PipelineOutputs["groundedness"];
  ai_tell_check: PipelineOutputs["ai_tell_check"];
  notes: string;
};

function stubVerdict(c: Case, out: PipelineOutputs): JudgeVerdict {
  // Deterministic stub for dry-runs. Mid-range scores so regression checks
  // exercise both directions when comparing two stub runs.
  const base = (c.id.charCodeAt(0) % 2) === 0 ? 3 : 4;
  return {
    judge_model: "stub",
    scores: {
      bullets: { relevance: base, specificity: base },
      cover_letter: { relevance: base, specificity: base },
      questions: { relevance: base, specificity: base },
    },
    groundedness: out.groundedness,
    ai_tell_check: out.ai_tell_check,
    notes: "stub verdict (EVAL_DRY_RUN=1)",
  };
}

export async function judgeOutput(c: Case, out: PipelineOutputs): Promise<JudgeVerdict> {
  if (process.env.EVAL_DRY_RUN === "1" || !process.env.NVIDIA_API_KEY) {
    return stubVerdict(c, out);
  }

  const systemPrompt = readFileSync(JUDGE_PROMPT_PATH, "utf8");
  const userMessage = renderUserMessage(out);
  const openai = new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: NVIDIA_BASE_URL });

  const callJudge = async (model: string) => {
    return openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });
  };

  let raw: string | null = null;
  let model = JUDGE_MODEL_PRIMARY;
  try {
    const resp = await callJudge(JUDGE_MODEL_PRIMARY);
    raw = resp.choices[0]?.message?.content ?? null;
  } catch {
    model = JUDGE_MODEL_FALLBACK;
    const resp = await callJudge(JUDGE_MODEL_FALLBACK);
    raw = resp.choices[0]?.message?.content ?? null;
  }
  if (!raw) throw new Error(`Judge returned empty content for ${c.id}`);
  const parsed = JSON.parse(raw) as Omit<JudgeVerdict, "judge_model">;
  return { ...parsed, judge_model: model };
}

function renderUserMessage(out: PipelineOutputs): string {
  return [
    `<jd_structured>\n${JSON.stringify(out.jd_structured, null, 2)}\n</jd_structured>`,
    `<cv_summary>\n${JSON.stringify(out.cv_summary, null, 2)}\n</cv_summary>`,
    `<outputs>\n<bullets>${JSON.stringify(out.bullets)}</bullets>\n<cover_letter>${out.cover_letter}</cover_letter>\n<questions>${JSON.stringify(out.questions)}</questions>\n</outputs>`,
    `<deterministic_signals>\ngroundedness=${JSON.stringify(out.groundedness)}\nai_tell_check=${JSON.stringify(out.ai_tell_check)}\n</deterministic_signals>`,
  ].join("\n\n");
}
