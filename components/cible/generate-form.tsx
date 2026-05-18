"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type JobInputType = "url" | "text";
type Stage = { stage: string; agent: string };

type GenerateResult = {
  trace_id: string;
  source_url: string | null;
  tailoredBullets: { text: string; addresses_requirement: string }[];
  coverLetter: string;
  likelyQuestions: { question: string; hint: string; type: string }[];
  stub?: boolean;
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
  return (
    <div className="space-y-6">
      {r.stub && (
        <p className="text-xs text-muted-foreground">
          Day 3 stub response. Real generation lands Day 4 (writers) and Day 6 (verifier).
        </p>
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

      <p className="font-mono text-xs text-muted-foreground">trace_id: {r.trace_id}</p>
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
