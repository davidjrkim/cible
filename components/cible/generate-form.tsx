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

type GenerateResult = {
  trace_id: string;
  source_url: string | null;
  tailoredBullets: { text: string; addresses_requirement: string }[];
  coverLetter: string;
  likelyQuestions: { question: string; hint: string; type: string }[];
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

const STAGE_LABEL: Record<string, string> = {
  extracting: "Extracting requirements...",
  aligning: "Aligning your CV...",
  drafting: "Drafting cover letter...",
  predicting: "Predicting questions...",
  verifying: "Checking groundedness...",
  scoring: "Reviewing quality...",
};

export function GenerateForm() {
  const [jobType, setJobType] = useState<JobInputType>("text");
  const [jobValue, setJobValue] = useState("");
  const [cv, setCv] = useState("");
  const [removeAiTells, setRemoveAiTells] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [stage, setStage] = useState<Stage | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setStage(null);
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
      setStage(null);
    }

    function handleEvent(chunk: string) {
      const eventLine = chunk.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!eventLine || !dataLine) return;
      const event = eventLine.slice(6).trim();
      const data = JSON.parse(dataLine.slice(5).trim());
      if (event === "stage") setStage(data);
      else if (event === "result") setResult(data);
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
              placeholder="Paste the full job description here..."
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
            placeholder="Paste your CV as plain text..."
            className="min-h-56 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </fieldset>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={removeAiTells}
            onChange={(e) => setRemoveAiTells(e.target.checked)}
            disabled={submitting}
          />
          Remove AI tells (strip em dashes and banned phrases)
        </label>

        <div className="flex items-center gap-4">
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Generating..." : "Generate"}
          </Button>
          {stage && (
            <span className="text-sm text-muted-foreground">
              {STAGE_LABEL[stage.stage] ?? stage.stage}
            </span>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && <ResultCards r={result} />}
    </div>
  );
}

function ResultCards({ r }: { r: GenerateResult }) {
  const groundednessFailed =
    r.groundedness &&
    (!r.groundedness.bullets.pass || !r.groundedness.cover_letter.pass);
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

      <Card title="Tailored CV bullets">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {r.tailoredBullets.map((b, i) => (
            <li key={i}>{b.text}</li>
          ))}
        </ul>
      </Card>

      <Card title="Cover letter">
        <pre className="whitespace-pre-wrap font-sans text-sm">{r.coverLetter}</pre>
      </Card>

      <Card title="Likely interview questions">
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
