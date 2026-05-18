import { z } from "zod";
import { scrapeJobPosting } from "@/lib/scrape";
import { checkRateLimit, clientIp } from "@/lib/ratelimit";
import { recordGeneration, saveTrace } from "@/lib/persistence";
import {
  alignCv,
  critique,
  extractRequirements,
  generateQuestions,
  verifyGroundedness,
  writeCoverLetter,
  type AgentTrace,
  type CriticVerdict,
} from "@/lib/agents";

export const runtime = "edge";

const BodySchema = z.object({
  jobInput: z.discriminatedUnion("type", [
    z.object({ type: z.literal("url"), value: z.string().url() }),
    z.object({ type: z.literal("text"), value: z.string().min(50) }),
  ]),
  cv: z.string().min(50),
  removeAiTells: z.boolean(),
});

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
  const t0 = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(sse(event, data)));

      try {
        send("trace", { trace_id: traceId });

        // Step 1: extractor (serial — downstream depends on it).
        send("stage", { stage: "extracting", agent: "requirements_extractor" });
        const extractor = await extractRequirements(jdText, { traceId, step: "" });
        const cvSummary = summarizeCv(cv);

        // Steps 2-4: parallel writers. Announce all three before kickoff.
        send("stage", { stage: "aligning", agent: "cv_aligner" });
        send("stage", { stage: "drafting", agent: "cover_letter_writer" });
        send("stage", { stage: "predicting", agent: "question_generator" });

        // eslint-disable-next-line prefer-const
        let [aligner, cover, questions] = await Promise.all([
          alignCv({ requirements: extractor.data, cv }, { traceId, step: "" }),
          writeCoverLetter({ requirements: extractor.data, cv }, { traceId, step: "" }),
          generateQuestions(
            { requirements: extractor.data, cvSummary },
            { traceId, step: "" },
          ),
        ]);

        const traces: AgentTrace[] = [extractor.trace, aligner.trace, cover.trace, questions.trace];

        // Step 5: groundedness verifier with one retry per writer.
        send("stage", { stage: "verifying", agent: "groundedness_verifier" });
        let groundedness = await verifyGroundedness(
          { bullets: aligner.data, coverLetter: cover.data, cv },
          { traceId, step: "" },
        );
        traces.push(...groundedness.traces);

        const retryTasks: Promise<void>[] = [];
        if (!groundedness.bullets.pass) {
          retryTasks.push(
            alignCv(
              {
                requirements: extractor.data,
                cv,
                retryFeedback: groundedness.bullets.unsupported_claims.join("\n"),
              },
              { traceId, step: "" },
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
                cv,
                retryFeedback: groundedness.cover_letter.unsupported_claims.join("\n"),
              },
              { traceId, step: "" },
            ).then((r) => {
              cover = { data: r.data, trace: { ...r.trace, retries: cover.trace.retries + 1 } };
              traces.push(cover.trace);
            }),
          );
        }
        if (retryTasks.length > 0) {
          send("stage", { stage: "retrying", agent: "groundedness_retry" });
          await Promise.all(retryTasks);
          groundedness = await verifyGroundedness(
            { bullets: aligner.data, coverLetter: cover.data, cv },
            { traceId, step: "" },
          );
          traces.push(...groundedness.traces);
        }

        // Step 6: cross-family critic — telemetry only, never gates retries.
        send("stage", { stage: "scoring", agent: "critic" });
        let critic: CriticVerdict | null = null;
        if (process.env.OPENAI_API_KEY) {
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
            console.warn(`critic failed for trace ${traceId}: ${(err as Error).message}`);
          }
        }

        const totalCost = traces.reduce((s, t) => s + t.cost_usd, 0);
        const totalLatencyMs = Date.now() - t0;
        const scores = critic
          ? {
              judge_model: "gpt-5",
              bullets: critic.scores.bullets,
              cover_letter: critic.scores.cover_letter,
              questions: critic.scores.questions,
            }
          : null;
        const retries = {
          bullets: aligner.trace.retries,
          cover_letter: cover.trace.retries,
          questions: questions.trace.retries,
        };
        const groundednessSummary = {
          bullets: groundedness.bullets,
          cover_letter: groundedness.cover_letter,
        };
        const createdAt = Date.now();

        send("result", {
          trace_id: traceId,
          source_url: sourceUrl,
          tailoredBullets: aligner.data.bullets.map((b) =>
            removeAiTells ? { ...b, text: stripAiTells(b.text) } : b,
          ),
          coverLetter: removeAiTells
            ? stripAiTells(cover.data.cover_letter)
            : cover.data.cover_letter,
          likelyQuestions: questions.data.questions,
          groundedness: groundednessSummary,
          scores,
          retries,
          totalLatencyMs,
          totalCostUsd: totalCost,
        });

        // Persist before closing the stream so the Edge runtime doesn't cancel
        // the Redis writes. The user already has the result; the extra wait
        // only delays stream termination, not first byte.
        try {
          await Promise.all([
            saveTrace({
              trace_id: traceId,
              created_at: createdAt,
              source_url: sourceUrl,
              total_latency_ms: totalLatencyMs,
              total_cost_usd: totalCost,
              retries,
              groundedness: groundednessSummary,
              scores,
              agents: traces,
            }),
            recordGeneration({
              trace_id: traceId,
              latency_ms: totalLatencyMs,
              cost_usd: totalCost,
              created_at: createdAt,
            }),
          ]);
        } catch (err) {
          console.warn(`persistence failed for trace ${traceId}: ${(err as Error).message}`);
        }
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { trace_id: traceId, message });
        controller.close();
      }
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

function summarizeCv(cv: string): { seniority: string; top_skills: string[] } {
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

// Day 10-11 will expand this list and surface it in the UI. Day 7 ships the plumbing.
const AI_TELL_WORDS = ["delve", "leverage", "tapestry", "underscore", "moreover", "furthermore"];

function stripAiTells(text: string): string {
  let out = text.replace(/—/g, ", ");
  for (const w of AI_TELL_WORDS) {
    out = out.replace(new RegExp(`\\b${w}\\b`, "gi"), "");
  }
  return out.replace(/\s+/g, " ").trim();
}
