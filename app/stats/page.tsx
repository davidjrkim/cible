import { readStats } from "@/lib/persistence";
import latestEval from "@/evals/latest.json";

export const metadata = {
  title: "Stats — Cible",
  description:
    "Live production stats: generation count, latency, cost, and latest cross-family eval scores.",
};

// Revalidate every 60s. The page is otherwise statically rendered from the
// most recent Redis snapshot, so it stays cheap under load.
export const revalidate = 60;

function formatNum(n: number | null, digits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatPct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatUsd(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toFixed(4)}`;
}

export default async function StatsPage() {
  const stats = await readStats();
  return (
    <main className="flex-1">
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-24">
        <p className="font-mono text-sm text-muted-foreground">cible.work / stats</p>
        <h1 className="mt-2 mb-2 text-3xl font-semibold tracking-tight">Live stats</h1>
        <p className="mb-10 text-sm text-muted-foreground">
          Real production usage. Updates every 60 seconds.
        </p>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Generations
        </h2>
        <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Total" value={formatNum(stats.total)} />
          <Stat label="Last 24h" value={formatNum(stats.last_24h)} />
          <Stat label="p50 latency" value={`${formatNum(stats.p50_latency_ms)}ms`} />
          <Stat label="p95 latency" value={`${formatNum(stats.p95_latency_ms)}ms`} />
          <Stat label="Mean latency" value={`${formatNum(stats.mean_latency_ms)}ms`} />
          <Stat label="Mean cost" value={formatUsd(stats.mean_cost_usd)} />
          <Stat label="Sample size" value={formatNum(stats.sample_size)} hint="rolling, last 500" />
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Latest eval scores
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Judge model:{" "}
          <span className="font-mono text-foreground">{latestEval.judge_model}</span> — chosen to be
          a different family from the generators so the score is not self-graded.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat
            label="Mean relevance"
            value={`${formatNum(latestEval.mean_relevance, 2)} / 5`}
          />
          <Stat
            label="Mean specificity"
            value={`${formatNum(latestEval.mean_specificity, 2)} / 5`}
          />
          <Stat
            label="Groundedness pass"
            value={formatPct(latestEval.groundedness_pass_rate)}
          />
          <Stat
            label="AI-tell pass (pre-strip)"
            value={formatPct(latestEval.ai_tell_pass_rate)}
          />
          <Stat label="Eval cases" value={formatNum(latestEval.n)} />
          <Stat
            label="Commit"
            value={latestEval.git_sha}
            hint={new Date(latestEval.generated_at).toISOString().slice(0, 10)}
          />
        </div>

        <p className="mt-10 text-xs text-muted-foreground">
          Eval CSVs live under <span className="font-mono">evals/results/</span> in the repo. The
          regression gate runs a per-case check, a Wilcoxon signed-rank paired test, and a 95%
          groundedness floor on every prompt change.
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
