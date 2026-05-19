import { MODELS } from "@/lib/models";
import { costFromUsage, generate, stripJsonFence } from "./client";
import { CriticVerdictSchema, type AgentTrace, type CriticVerdict, type Requirements } from "./types";

const STEP = "cross_family_critic";

// Note: critic is now Llama 3.3 70B — same family as the writers (also Llama
// on NVIDIA NIM). This weakens the bias guarantee of the original cross-family
// design; treat critic scores as a soft signal, not an independent quality
// check, until a different-family judge is wired back in (e.g. DeepSeek,
// Mistral on NIM, or paid OpenAI/Anthropic).
const SYSTEM = `You are an impartial evaluator scoring outputs from a job-application generator. Your job is to give an independent quality signal, not to rewrite or improve the outputs.

For each output type — bullets, cover_letter, questions — return integer scores 1-5 on two axes:

- relevance: does the output respond to what the JD specifically asks for? 5 = directly maps to JD must_have_skills or key_responsibilities; 1 = generic.
- specificity: tailored to THIS JD and this candidate, or copy-pasteable to any role? 5 = could not be reused; 1 = boilerplate.

Add a short "notes" field (<= 2 sentences) describing the most salient weakness. Notes are dashboard telemetry; users never see them.

Groundedness is NOT your job — a deterministic verifier handles it upstream. Score only relevance and specificity.

Return ONLY a JSON object of this exact shape:
{
  "scores": {
    "bullets":      { "relevance": 1-5, "specificity": 1-5 },
    "cover_letter": { "relevance": 1-5, "specificity": 1-5 },
    "questions":    { "relevance": 1-5, "specificity": 1-5 }
  },
  "notes": string
}`;

export type CriticInput = {
  requirements: Requirements;
  cvSummary: { seniority: string; top_skills: string[] };
  bullets: { text: string; addresses_requirement: string }[];
  coverLetter: string;
  questions: { question: string; hint: string; type: string }[];
};

export type CriticResult = { data: CriticVerdict; trace: AgentTrace };

function renderUser(input: CriticInput): string {
  return [
    `<jd_structured>\n${JSON.stringify(input.requirements, null, 2)}\n</jd_structured>`,
    `<cv_summary>\n${JSON.stringify(input.cvSummary, null, 2)}\n</cv_summary>`,
    `<outputs>\n<bullets>${JSON.stringify(input.bullets)}</bullets>\n<cover_letter>${input.coverLetter}</cover_letter>\n<questions>${JSON.stringify(input.questions)}</questions>\n</outputs>`,
  ].join("\n\n");
}

export async function critique(input: CriticInput, meta: { traceId: string }): Promise<CriticResult> {
  const t0 = Date.now();
  const resp = await generate(
    {
      model: MODELS.critic,
      system: SYSTEM,
      userText: renderUser(input),
      maxOutputTokens: 1024,
    },
    { traceId: meta.traceId, step: STEP },
  );

  const parsed = JSON.parse(stripJsonFence(resp.text));
  const data = CriticVerdictSchema.parse(parsed);

  return {
    data,
    trace: {
      step: STEP,
      model: MODELS.critic,
      latency_ms: Date.now() - t0,
      cost_usd: costFromUsage(MODELS.critic, resp.usage),
      retries: 0,
    },
  };
}
