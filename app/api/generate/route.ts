import { z } from "zod";
import { scrapeJobPosting } from "@/lib/scrape";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";

export const runtime = "edge";

const BodySchema = z.object({
  jobInput: z.discriminatedUnion("type", [
    z.object({ type: z.literal("url"), value: z.string().url() }),
    z.object({ type: z.literal("text"), value: z.string().min(50) }),
  ]),
  cv: z.string().min(50),
  removeAiTells: z.boolean(),
});

type Stage = { stage: string; agent: string };
const STAGES: Stage[] = [
  { stage: "extracting", agent: "requirements_extractor" },
  { stage: "aligning", agent: "cv_aligner" },
  { stage: "drafting", agent: "cover_letter_writer" },
  { stage: "predicting", agent: "question_generator" },
  { stage: "verifying", agent: "groundedness_verifier" },
  { stage: "scoring", agent: "critic" },
];

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const verdict = await checkRateLimit(ip);
  if (!verdict.ok) {
    return new Response(
      JSON.stringify({ error: "rate_limited", window: verdict.window, reset: verdict.reset }),
      { status: 429, headers: { "content-type": "application/json" } },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_request", issues: parsed.error.issues }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const { jobInput, cv, removeAiTells } = parsed.data;

  let jdText: string;
  let sourceUrl: string | null = null;
  if (jobInput.type === "url") {
    const r = await scrapeJobPosting(jobInput.value);
    if (!r.ok) {
      return new Response(
        JSON.stringify({
          error: "scrape_failed",
          reason: r.reason,
          hint: "Paste the job posting as text instead.",
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      );
    }
    jdText = r.text;
    sourceUrl = r.source_url;
  } else {
    jdText = jobInput.value;
  }

  const traceId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(sse("trace", { trace_id: traceId })));
      for (const s of STAGES) {
        controller.enqueue(enc.encode(sse("stage", s)));
        await new Promise((r) => setTimeout(r, 250));
      }
      const result = mockResult(traceId, jdText, cv, removeAiTells, sourceUrl);
      controller.enqueue(enc.encode(sse("result", result)));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-trace-id": traceId,
    },
  });
}

function mockResult(
  traceId: string,
  jd: string,
  cv: string,
  removeAiTells: boolean,
  sourceUrl: string | null,
) {
  const firstLine = jd.split("\n").find((l) => l.trim().length > 0) ?? "Unknown role";
  const company = firstLine.split(/[—-]/).pop()?.trim().slice(0, 60) ?? "the team";
  return {
    trace_id: traceId,
    source_url: sourceUrl,
    tailoredBullets: [
      { text: `Built systems applicable to ${company}'s needs (stub — real writer agent lands Day 4).`, addresses_requirement: "stub" },
    ],
    coverLetter: `Dear ${company} team,\n\nThis is a stub cover letter from the Day 3 mock route. The real Sonnet writer ships Day 4.\n\nBest,\n${cv.split("\n")[0]?.slice(0, 40) ?? "Candidate"}`,
    likelyQuestions: [
      { question: "Walk me through your most relevant project.", hint: "stub", type: "technical" },
      { question: "Tell me about a time you disagreed with a teammate.", hint: "stub", type: "behavioral" },
      { question: `Why ${company}?`, hint: "stub", type: "company_specific" },
    ],
    groundedness: {
      bullets: { pass: true, unsupported_claims: [] },
      cover_letter: { pass: true, unsupported_claims: [] },
    },
    scores: {
      judge_model: "gpt-5",
      bullets: { relevance: 0, specificity: 0 },
      cover_letter: { relevance: 0, specificity: 0 },
      questions: { relevance: 0, specificity: 0 },
    },
    retries: { bullets: 0, cover_letter: 0, questions: 0 },
    totalLatencyMs: 0,
    totalCostUsd: 0,
    removeAiTells,
    stub: true,
  };
}
