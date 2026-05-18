import { readStats } from "@/lib/persistence";
import latestEval from "@/evals/latest.json";

export const runtime = "edge";

export async function GET() {
  const stats = await readStats();
  return new Response(
    JSON.stringify({
      generations: {
        total: stats.total,
        last_24h: stats.last_24h,
      },
      latency_ms: {
        p50: stats.p50_latency_ms,
        p95: stats.p95_latency_ms,
        mean: stats.mean_latency_ms,
      },
      mean_cost_usd: stats.mean_cost_usd,
      sample_size: stats.sample_size,
      evals: latestEval,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=60, s-maxage=60",
      },
    },
  );
}
