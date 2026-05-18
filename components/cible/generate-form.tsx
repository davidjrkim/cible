"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type JobInputType = "url" | "text";
type Stage = { stage: string; agent: string };

type Groundedness = {
  bullets: { pass: boolean; unsupported_claims: string[] };
  cover_letter: { pass: boolean; unsupported_claims: string[] };
};

type Scores = {
  judge_model: string;
  bullets: { relevance: number; specificity: number };
  cover_letter: { relevance: number; specificity: number };
  questions: { relevance: number; specificity: number };
} | null;

type Bullet = { text: string; addresses_requirement: string };
type Question = { question: string; hint: string; type: string };

type GenerateResult = {
  trace_id: string;
  source_url: string | null;
  tailoredBullets: Bullet[];
  coverLetter: string;
  likelyQuestions: Question[];
  groundedness?: Groundedness;
  scores?: Scores;
  retries?: { bullets: number; cover_letter: number; questions: number };
  totalLatencyMs?: number;
  totalCostUsd?: number;
  stub?: boolean;
};

type AgentTrace = {
  step: string;
  model: string;
  latency_ms: number;
  cost_usd: number;
  retries: number;
};

type StoredTrace = {
  trace_id: string;
  created_at: number;
  total_latency_ms: number;
  total_cost_usd: number;
  agents: AgentTrace[];
};

type CopyTarget = "bullets" | "cover_letter" | "questions";

const STAGE_LABEL: Record<string, string> = {
  extracting: "Extracting requirements…",
  aligning: "Aligning your CV…",
  drafting: "Drafting cover letter…",
  predicting: "Predicting questions…",
  verifying: "Checking groundedness…",
  retrying: "Retrying ungrounded claims…",
  scoring: "Reviewing quality…",
};

export function GenerateForm() {
  const [jobType, setJobType] = useState<JobInputType>("text");
  const [jobValue, setJobValue] = useState("");
  const [cv, setCv] = useState("");
  const [removeAiTells, setRemoveAiTells] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setStages([]);
    setSubmitting(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobInput: { type: jobType, value: jobValue },
          cv,
          removeAiTells,
        }),
      });
      if (!res.ok || !res.body) {
        if (res.status === 504) {
          throw new Error(
            "Generation timed out (Edge runtime 25s cap). Try a shorter CV or retry — the pipeline occasionally hits this on cold caches.",
          );
        }
        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            `Rate limited (${body.window ?? "limit"}). Try again in a bit — the cap is 10/day, 3/hour per IP.`,
          );
        }
        const body = await res.json().catch(() => ({ error: "unknown" }));
        const hint = body.hint ? ` — ${body.hint}` : "";
        throw new Error(`${body.error ?? `http_${res.status}`}${hint}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleEvent(chunk);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }

    function handleEvent(chunk: string) {
      const eventLine = chunk.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!eventLine || !dataLine) return;
      const event = eventLine.slice(6).trim();
      const data = JSON.parse(dataLine.slice(5).trim());
      if (event === "stage") setStages((prev) => [...prev, data]);
      else if (event === "result") setResult(data);
      else if (event === "error") {
        throw new Error(data.message ?? "pipeline_error");
      }
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-6">
        <fieldset className="space-y-2" disabled={submitting}>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Job posting</label>
            <div className="inline-flex rounded-md border bg-background p-0.5 text-xs">
              {(["url", "text"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setJobType(t)}
                  aria-pressed={jobType === t}
                  className={`rounded px-2 py-1 ${
                    jobType === t ? "bg-foreground text-background" : "text-muted-foreground"
                  }`}
                >
                  {t === "url" ? "URL" : "Paste text"}
                </button>
              ))}
            </div>
          </div>
          {jobType === "url" ? (
            <input
              type="url"
              required
              value={jobValue}
              onChange={(e) => setJobValue(e.target.value)}
              placeholder="https://example.com/jobs/senior-engineer"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            <textarea
              required
              minLength={50}
              value={jobValue}
              onChange={(e) => setJobValue(e.target.value)}
              placeholder="Paste the full job description here…"
              className="min-h-40 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          )}
        </fieldset>

        <fieldset className="space-y-2" disabled={submitting}>
          <label className="text-sm font-medium">Your CV</label>
          <textarea
            required
            minLength={50}
            value={cv}
            onChange={(e) => setCv(e.target.value)}
            placeholder="Paste your CV as plain text…"
            className="min-h-56 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </fieldset>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={removeAiTells}
            onChange={(e) => setRemoveAiTells(e.target.checked)}
            disabled={submitting}
            className="mt-0.5"
          />
          <span>
            Remove AI tells
            <span className="block text-xs text-muted-foreground">
              Tells the writer prompts to avoid em dashes and a banned phrase list, and strips any
              that slip through. Pre-strip output is checked in evals.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Generating…" : "Generate"}
          </Button>
          {submitting && <StageProgress stages={stages} />}
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && <ResultCards key={result.trace_id} r={result} />}
    </div>
  );
}

function StageProgress({ stages }: { stages: Stage[] }) {
  const current = stages.at(-1);
  if (!current) {
    return <span className="text-sm text-muted-foreground">Starting pipeline…</span>;
  }
  const label = STAGE_LABEL[current.stage] ?? current.stage;
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-foreground/60" />
      <span>
        {label}{" "}
        <span className="font-mono text-xs">
          ({stages.length} / 6)
        </span>
      </span>
    </div>
  );
}

function ResultCards({ r }: { r: GenerateResult }) {
  // Parent passes a `key={trace_id}` so this component remounts on each new
  // generation, giving us a clean reset of the editable cover letter state.
  const [coverLetter, setCoverLetter] = useState(r.coverLetter);
  const [coverEditing, setCoverEditing] = useState(false);

  const groundednessFailed =
    r.groundedness &&
    (!r.groundedness.bullets.pass || !r.groundedness.cover_letter.pass);

  const bulletsText = r.tailoredBullets.map((b) => `- ${b.text}`).join("\n");
  const questionsText = r.likelyQuestions
    .map((q) => `[${q.type}] ${q.question}\n   hint: ${q.hint}`)
    .join("\n\n");

  return (
    <div className="space-y-6">
      {r.stub && (
        <p className="text-xs text-muted-foreground">
          Day 3 stub response. Real generation lands Day 4 (writers) and Day 6 (verifier).
        </p>
      )}

      {groundednessFailed && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <p className="font-medium">Ungrounded claims detected</p>
          <p className="mt-1 text-muted-foreground">
            The verifier could not match every claim back to your CV after a retry. Review the
            output carefully before sending.
          </p>
        </div>
      )}

      <Card
        title="Tailored CV bullets"
        copy={{ traceId: r.trace_id, target: "bullets", text: bulletsText }}
      >
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {r.tailoredBullets.map((b, i) => (
            <li key={i}>{b.text}</li>
          ))}
        </ul>
      </Card>

      <Card
        title="Cover letter"
        copy={{ traceId: r.trace_id, target: "cover_letter", text: coverLetter }}
        actions={
          <button
            type="button"
            onClick={() => setCoverEditing((v) => !v)}
            className="rounded border bg-background px-2 py-1 text-xs hover:bg-muted"
          >
            {coverEditing ? "Done" : "Edit"}
          </button>
        }
      >
        {coverEditing ? (
          <textarea
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            className="min-h-64 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm">{coverLetter}</pre>
        )}
      </Card>

      <Card
        title="Likely interview questions"
        copy={{ traceId: r.trace_id, target: "questions", text: questionsText }}
      >
        <ul className="space-y-3 text-sm">
          {r.likelyQuestions.map((q, i) => (
            <li key={i}>
              <span className="font-mono text-xs text-muted-foreground">[{q.type}]</span>{" "}
              {q.question}
            </li>
          ))}
        </ul>
      </Card>

      <TraceView result={r} />
    </div>
  );
}

function TraceView({ result }: { result: GenerateResult }) {
  const [open, setOpen] = useState(false);
  const [trace, setTrace] = useState<StoredTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || trace) return;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`/api/trace/${result.trace_id}`).catch(() => null);
        if (cancelled) return;
        if (res?.ok) {
          const json = (await res.json()) as StoredTrace;
          if (!cancelled) {
            setTrace(json);
            setLoading(false);
          }
          return;
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled) {
        setError("Trace not available (Redis may be unconfigured in dev).");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, result.trace_id, trace]);

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium"
      >
        <span>{open ? "Hide trace" : "View trace"}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {result.totalLatencyMs != null && `${result.totalLatencyMs}ms`}
          {result.totalCostUsd != null && ` · $${result.totalCostUsd.toFixed(4)}`}
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t px-5 py-4">
          <TraceSummary result={result} />
          {loading && <p className="text-xs text-muted-foreground">Loading agent chain…</p>}
          {error && <p className="text-xs text-muted-foreground">{error}</p>}
          {trace && <AgentChain agents={trace.agents} />}
          <p className="font-mono text-xs text-muted-foreground">trace_id: {result.trace_id}</p>
        </div>
      )}
    </div>
  );
}

function TraceSummary({ result }: { result: GenerateResult }) {
  const g = result.groundedness;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {g && (
        <div className="text-xs">
          <p className="mb-1 font-medium uppercase tracking-wider text-muted-foreground">
            Groundedness verdict
          </p>
          <p>
            bullets:{" "}
            <span className={g.bullets.pass ? "text-emerald-600" : "text-amber-600"}>
              {g.bullets.pass ? "pass" : "FAIL"}
            </span>
            {g.bullets.unsupported_claims.length > 0 &&
              ` (${g.bullets.unsupported_claims.length} unsupported)`}
          </p>
          <p>
            cover letter:{" "}
            <span className={g.cover_letter.pass ? "text-emerald-600" : "text-amber-600"}>
              {g.cover_letter.pass ? "pass" : "FAIL"}
            </span>
            {g.cover_letter.unsupported_claims.length > 0 &&
              ` (${g.cover_letter.unsupported_claims.length} unsupported)`}
          </p>
        </div>
      )}
      {result.scores && (
        <div className="text-xs">
          <p className="mb-1 font-medium uppercase tracking-wider text-muted-foreground">
            Critic scores ({result.scores.judge_model})
          </p>
          <p>
            bullets: {result.scores.bullets.relevance}/{result.scores.bullets.specificity}
          </p>
          <p>
            cover letter: {result.scores.cover_letter.relevance}/
            {result.scores.cover_letter.specificity}
          </p>
          <p>
            questions: {result.scores.questions.relevance}/{result.scores.questions.specificity}
          </p>
        </div>
      )}
    </div>
  );
}

function AgentChain({ agents }: { agents: AgentTrace[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 pr-4 font-medium">Step</th>
            <th className="py-1 pr-4 font-medium">Model</th>
            <th className="py-1 pr-4 text-right font-medium">Latency</th>
            <th className="py-1 pr-4 text-right font-medium">Cost</th>
            <th className="py-1 text-right font-medium">Retries</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {agents.map((a, i) => (
            <tr key={i} className="border-t">
              <td className="py-1 pr-4">{a.step}</td>
              <td className="py-1 pr-4 text-muted-foreground">{a.model}</td>
              <td className="py-1 pr-4 text-right tabular-nums">{a.latency_ms}ms</td>
              <td className="py-1 pr-4 text-right tabular-nums">${a.cost_usd.toFixed(5)}</td>
              <td className="py-1 text-right tabular-nums">{a.retries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Card({
  title,
  children,
  copy,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  copy?: { traceId: string; target: CopyTarget; text: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          {actions}
          {copy && <CopyButton {...copy} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function CopyButton({
  traceId,
  target,
  text,
}: {
  traceId: string;
  target: CopyTarget;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in insecure contexts (http://). Don't block the event.
    }
    // Fire and forget; engagement metric in §3 doesn't gate on response.
    fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "copy_clicked", trace_id: traceId, target }),
      keepalive: true,
    }).catch(() => {});
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border bg-background px-2 py-1 text-xs hover:bg-muted"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
