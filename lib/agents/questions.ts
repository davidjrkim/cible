import { MODELS } from "@/lib/models";
import {
  costFromUsage,
  generate,
  stripJsonFence,
  type TraceMeta,
} from "./client";
import { QuestionsSchema, type AgentTrace, type Questions, type Requirements } from "./types";

const STEP = "question_generator";

const SYSTEM = `You generate 3-5 likely interview questions for a specific role.

Return ONLY a JSON object matching this exact shape (no prose, no markdown):
{
  "questions": [
    { "question": string, "hint": string, "type": "technical" | "behavioral" | "company_specific" }
  ]
}

Hard rules:
- Output 3-5 questions total.
- The set MUST include at least one of each type: "technical", "behavioral", "company_specific".
- "technical" questions probe must_have_skills or key_responsibilities from the structured JD.
- "behavioral" questions probe how the candidate has handled past situations relevant to the role.
- "company_specific" questions are answerable only with research about THIS company (product, stack, recent news pulled from the JD).
- "hint" is a one-sentence prep note pointing to a CV item or a JD detail to anchor the answer.
- No generic interview filler ("Tell me about yourself", "What is your tech stack?").`;

export type QuestionGenResult = { data: Questions; trace: AgentTrace };

type CvSummary = { seniority: string; top_skills: string[] };

function missingTypes(qs: Questions["questions"]): string[] {
  const have = new Set(qs.map((q) => q.type));
  return ["technical", "behavioral", "company_specific"].filter((t) => !have.has(t as Questions["questions"][number]["type"]));
}

export async function generateQuestions(
  args: { requirements: Requirements; cvSummary: CvSummary },
  meta: TraceMeta,
): Promise<QuestionGenResult> {
  const t0 = Date.now();
  let retries = 0;
  let lastError: Error | null = null;
  let typeMixFeedback = "";

  const buildUserText = (feedback: string) =>
    `<structured_jd>\n${JSON.stringify(args.requirements, null, 2)}\n</structured_jd>\n\n` +
    `<cv_summary>\n${JSON.stringify(args.cvSummary, null, 2)}\n</cv_summary>\n\n` +
    (feedback || "Produce the JSON now.");

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await generate(
      {
        model: MODELS.writer,
        system: SYSTEM,
        userText: buildUserText(typeMixFeedback),
        maxOutputTokens: 1024,
      },
      { ...meta, step: STEP },
    );

    try {
      const json = JSON.parse(stripJsonFence(resp.text));
      const data = QuestionsSchema.parse(json);
      const missing = missingTypes(data.questions);
      if (missing.length > 0 && attempt === 0) {
        typeMixFeedback = `<feedback>\nPrevious attempt was missing question type(s): ${missing.join(", ")}. The set MUST include at least one of each: technical, behavioral, company_specific.\n</feedback>`;
        retries++;
        continue;
      }
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

  throw new Error(`questions: failed to produce valid JSON after retry — ${lastError?.message}`);
}
