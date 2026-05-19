import type { Case } from "./cases.ts";
import {
  alignCv,
  critique,
  extractRequirements,
  generateQuestions,
  verifyGroundedness,
  writeCoverLetter,
  type AgentTrace,
  type CriticVerdict,
} from "../lib/agents/index.ts";
import { aiTellCheck } from "../lib/ai-tells.ts";

export type PipelineOutputs = {
  jd_structured: {
    company_name: string;
    role_title: string;
    must_have_skills: string[];
    nice_to_have_skills: string[];
    key_responsibilities: string[];
    tone_indicators: string[];
  };
  cv_summary: { seniority: string; top_skills: string[] };
  bullets: { text: string; addresses_requirement: string; cv_evidence_span: string }[];
  cover_letter: string;
  cover_letter_evidence_spans: string[];
  questions: { question: string; hint: string; type: "technical" | "behavioral" | "company_specific" }[];
  critic: CriticVerdict | null;
  groundedness: {
    bullets: { pass: boolean; unsupported_claims: string[] };
    cover_letter: { pass: boolean; unsupported_claims: string[] };
  };
  ai_tell_check: {
    bullets: { pass: boolean; offending_tokens: string[] };
    cover_letter: { pass: boolean; offending_tokens: string[] };
  };
  retries: { bullets: number; cover_letter: number; questions: number };
  total_latency_ms: number;
  total_cost_usd: number;
  agent_traces: AgentTrace[];
};

function isLlmDryRun(): boolean {
  return process.env.EVAL_DRY_RUN === "1" || !process.env.NVIDIA_API_KEY;
}

function isCriticDryRun(): boolean {
  return process.env.EVAL_DRY_RUN === "1" || !process.env.NVIDIA_API_KEY;
}

export async function runPipeline(c: Case): Promise<PipelineOutputs> {
  if (isLlmDryRun()) return stubPipeline(c);

  const t0 = Date.now();
  const traceId = `eval-${c.id}-${Date.now()}`;
  const meta = { traceId, step: "" };

  // Step 1: extract requirements (serial — downstream steps depend on it).
  const extractor = await extractRequirements(c.jd, meta);
  const cvSummary = summarizeCv(c.cv);

  // Steps 2, 3, 4 run in parallel. Evals always exercise the removeAiTells
  // prompt branch — that's the production default and what the pre-strip
  // ai_tell_check is testing the model on.
  // eslint-disable-next-line prefer-const
  let [aligner, cover, questions] = await Promise.all([
    alignCv({ requirements: extractor.data, cv: c.cv, removeAiTells: true }, meta),
    writeCoverLetter({ requirements: extractor.data, cv: c.cv, removeAiTells: true }, meta),
    generateQuestions({ requirements: extractor.data, cvSummary }, meta),
  ]);

  const traces: AgentTrace[] = [extractor.trace, aligner.trace, cover.trace, questions.trace];

  // Step 5: groundedness verifier. One retry per writer if claims unsupported.
  let groundedness = await verifyGroundedness(
    { bullets: aligner.data, coverLetter: cover.data, cv: c.cv },
    meta,
  );
  traces.push(...groundedness.traces);

  const retryTasks: Promise<void>[] = [];
  if (!groundedness.bullets.pass) {
    retryTasks.push(
      alignCv(
        {
          requirements: extractor.data,
          cv: c.cv,
          removeAiTells: true,
          retryFeedback: groundedness.bullets.unsupported_claims.join("\n"),
        },
        meta,
      ).then((r) => {
        aligner = { data: r.data, trace: { ...r.trace, retries: aligner.trace.retries + 1 } };
        traces.push(aligner.trace);
      }),
    );
  }
  if (!groundedness.cover_letter.pass) {
    retryTasks.push(
      writeCoverLetter(
        {
          requirements: extractor.data,
          cv: c.cv,
          removeAiTells: true,
          retryFeedback: groundedness.cover_letter.unsupported_claims.join("\n"),
        },
        meta,
      ).then((r) => {
        cover = { data: r.data, trace: { ...r.trace, retries: cover.trace.retries + 1 } };
        traces.push(cover.trace);
      }),
    );
  }
  if (retryTasks.length > 0) {
    await Promise.all(retryTasks);
    // Re-verify once; whatever still fails ships with a visible warning (PRD §6).
    groundedness = await verifyGroundedness(
      { bullets: aligner.data, coverLetter: cover.data, cv: c.cv },
      meta,
    );
    traces.push(...groundedness.traces);
  }

  // Step 6: cross-family critic (telemetry only — does not gate retries).
  let critic: CriticVerdict | null = null;
  if (!isCriticDryRun()) {
    try {
      const result = await critique(
        {
          requirements: extractor.data,
          cvSummary,
          bullets: aligner.data.bullets,
          coverLetter: cover.data.cover_letter,
          questions: questions.data.questions,
        },
        { traceId },
      );
      critic = result.data;
      traces.push(result.trace);
    } catch (err) {
      console.warn(`  critic failed for ${c.id}: ${(err as Error).message}`);
    }
  }

  const totalCost = traces.reduce((s, t) => s + t.cost_usd, 0);

  // Pre-strip AI-tell check: the model output itself is inspected, not the
  // filtered version the UI ships. A failing case here means the prompt isn't
  // teaching the model — checking the post-strip output would only test the
  // filter (PRD §7).
  const bulletsJoined = aligner.data.bullets.map((b) => b.text).join("\n");
  const bulletsAiTell = aiTellCheck(bulletsJoined);
  const coverAiTell = aiTellCheck(cover.data.cover_letter);

  return {
    jd_structured: {
      company_name: extractor.data.company_name,
      role_title: extractor.data.role_title,
      must_have_skills: extractor.data.must_have_skills,
      nice_to_have_skills: extractor.data.nice_to_have_skills,
      key_responsibilities: extractor.data.key_responsibilities,
      tone_indicators: extractor.data.tone_indicators,
    },
    cv_summary: cvSummary,
    bullets: aligner.data.bullets,
    cover_letter: cover.data.cover_letter,
    cover_letter_evidence_spans: cover.data.cv_evidence_spans,
    questions: questions.data.questions,
    critic,
    groundedness: {
      bullets: groundedness.bullets,
      cover_letter: groundedness.cover_letter,
    },
    ai_tell_check: {
      bullets: bulletsAiTell,
      cover_letter: coverAiTell,
    },
    retries: {
      bullets: aligner.trace.retries,
      cover_letter: cover.trace.retries,
      questions: questions.trace.retries,
    },
    total_latency_ms: Date.now() - t0,
    total_cost_usd: totalCost,
    agent_traces: traces,
  };
}

function summarizeCv(cv: string): { seniority: string; top_skills: string[] } {
  // Heuristic placeholder until a dedicated summarizer lands. Question generator
  // and critic both consume this; values are coarse but sufficient for prompting.
  const lower = cv.toLowerCase();
  const seniority = /staff|principal/.test(lower)
    ? "staff"
    : /senior|lead/.test(lower)
      ? "senior"
      : /junior|intern/.test(lower)
        ? "junior"
        : "mid";
  return { seniority, top_skills: [] };
}

function stubPipeline(c: Case): PipelineOutputs {
  const firstLine = c.jd.split("\n").find((l) => l.startsWith("#")) ?? "# Unknown";
  const company = firstLine.replace(/^#+\s*/, "").split(/[—-]/).pop()?.trim() ?? "Unknown";
  return {
    jd_structured: {
      company_name: company,
      role_title: firstLine.replace(/^#+\s*/, "").split(/[—-]/)[0].trim(),
      must_have_skills: ["skill-a", "skill-b", "skill-c"],
      nice_to_have_skills: [],
      key_responsibilities: ["responsibility-a"],
      tone_indicators: ["direct"],
    },
    cv_summary: { seniority: "senior", top_skills: ["typescript", "react", "postgres"] },
    bullets: [
      {
        text: `Built X at previous job, directly applicable to ${company}'s needs.`,
        addresses_requirement: "skill-a",
        cv_evidence_span: c.cv.slice(0, 80),
      },
    ],
    cover_letter: `Dear ${company} team, here is a stub cover letter generated by the eval harness before live agents run. Set NVIDIA_API_KEY (and unset EVAL_DRY_RUN) to call the real writers.`,
    cover_letter_evidence_spans: [c.cv.slice(0, 80)],
    questions: [
      { question: "Walk me through your most relevant project.", hint: "stub", type: "technical" },
      { question: "Tell me about a time you disagreed with a teammate.", hint: "stub", type: "behavioral" },
      { question: `Why ${company}?`, hint: "stub", type: "company_specific" },
    ],
    critic: null,
    groundedness: {
      bullets: { pass: true, unsupported_claims: [] },
      cover_letter: { pass: true, unsupported_claims: [] },
    },
    ai_tell_check: {
      bullets: { pass: true, offending_tokens: [] },
      cover_letter: { pass: true, offending_tokens: [] },
    },
    retries: { bullets: 0, cover_letter: 0, questions: 0 },
    total_latency_ms: 0,
    total_cost_usd: 0,
    agent_traces: [],
  };
}
