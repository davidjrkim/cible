import OpenAI from "openai";
import { MODELS } from "@/lib/models";
import { CriticVerdictSchema, type AgentTrace, type CriticVerdict, type Requirements } from "./types";

const STEP = "cross_family_critic";

const SYSTEM = `You are an impartial evaluator scoring outputs from a job-application generator. You were built by a different vendor than the generators on purpose, so your job is to give an independent quality signal, not to rewrite or improve the outputs.

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

// gpt-5 input/output per-million pricing as of 2026-05. Source: OpenAI public pricing.
const CRITIC_PRICING = { input: 1.25, output: 10 };

export type CriticInput = {
  requirements: Requirements;
  cvSummary: { seniority: string; top_skills: string[] };
  bullets: { text: string; addresses_requirement: string }[];
  coverLetter: string;
  questions: { question: string; hint: string; type: string }[];
};

export type CriticResult = { data: CriticVerdict; trace: AgentTrace };

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  _openai = new OpenAI({ apiKey });
  return _openai;
}

function renderUser(input: CriticInput): string {
  return [
    `<jd_structured>\n${JSON.stringify(input.requirements, null, 2)}\n</jd_structured>`,
    `<cv_summary>\n${JSON.stringify(input.cvSummary, null, 2)}\n</cv_summary>`,
    `<outputs>\n<bullets>${JSON.stringify(input.bullets)}</bullets>\n<cover_letter>${input.coverLetter}</cover_letter>\n<questions>${JSON.stringify(input.questions)}</questions>\n</outputs>`,
  ].join("\n\n");
}

export async function critique(input: CriticInput, _meta: { traceId: string }): Promise<CriticResult> {
  const t0 = Date.now();
  const resp = await openai().chat.completions.create({
    model: MODELS.critic,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: renderUser(input) },
    ],
    response_format: { type: "json_object" },
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("critic: empty response");
  const parsed = JSON.parse(raw);
  const data = CriticVerdictSchema.parse(parsed);

  const inputTokens = resp.usage?.prompt_tokens ?? 0;
  const outputTokens = resp.usage?.completion_tokens ?? 0;
  const cost = (inputTokens * CRITIC_PRICING.input + outputTokens * CRITIC_PRICING.output) / 1_000_000;

  return {
    data,
    trace: {
      step: STEP,
      model: MODELS.critic,
      latency_ms: Date.now() - t0,
      cost_usd: cost,
      retries: 0,
    },
  };
}
