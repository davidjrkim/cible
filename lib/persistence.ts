import { Redis } from "@upstash/redis";
import type { AgentTrace } from "@/lib/agents";

let _redis: Redis | null = null;
export function redis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

const TRACE_TTL_SECONDS = 7 * 24 * 60 * 60; // PRD §12.
const STATS_SAMPLE_CAP = 500;

export type StoredTrace = {
  trace_id: string;
  created_at: number;
  source_url: string | null;
  total_latency_ms: number;
  total_cost_usd: number;
  retries: { bullets: number; cover_letter: number; questions: number };
  groundedness: {
    bullets: { pass: boolean; unsupported_claims: string[] };
    cover_letter: { pass: boolean; unsupported_claims: string[] };
  };
  scores: {
    judge_model: string;
    bullets: { relevance: number; specificity: number };
    cover_letter: { relevance: number; specificity: number };
    questions: { relevance: number; specificity: number };
  } | null;
  agents: AgentTrace[];
};

export async function saveTrace(t: StoredTrace): Promise<void> {
  const r = redis();
  if (!r) return;
  await r.set(`trace:${t.trace_id}`, JSON.stringify(t), { ex: TRACE_TTL_SECONDS });
}

export async function getTrace(traceId: string): Promise<StoredTrace | null> {
  const r = redis();
  if (!r) return null;
  const raw = await r.get<string | StoredTrace>(`trace:${traceId}`);
  if (raw == null) return null;
  // Upstash auto-parses JSON when it can; tolerate either shape.
  return typeof raw === "string" ? (JSON.parse(raw) as StoredTrace) : raw;
}

export async function recordGeneration(args: {
  trace_id: string;
  latency_ms: number;
  cost_usd: number;
  created_at: number;
}): Promise<void> {
  const r = redis();
  if (!r) return;
  const day = 24 * 60 * 60 * 1000;
  const cutoff = args.created_at - day;
  // Pipelined for one round trip.
  const p = r.pipeline();
  p.incr("stats:total");
  p.zadd("stats:24h", { score: args.created_at, member: args.trace_id });
  p.zremrangebyscore("stats:24h", 0, cutoff);
  // Sample line: "<ts>:<latency_ms>:<cost_usd>"
  p.zadd("stats:samples", {
    score: args.created_at,
    member: `${args.created_at}:${args.latency_ms}:${args.cost_usd.toFixed(6)}`,
  });
  // Keep only the most-recent N samples for percentile/mean calc.
  p.zremrangebyrank("stats:samples", 0, -(STATS_SAMPLE_CAP + 1));
  await p.exec();
}

export type StatsSnapshot = {
  total: number;
  last_24h: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  mean_latency_ms: number | null;
  mean_cost_usd: number | null;
  sample_size: number;
};

export async function readStats(): Promise<StatsSnapshot> {
  const r = redis();
  if (!r) {
    return {
      total: 0,
      last_24h: 0,
      p50_latency_ms: null,
      p95_latency_ms: null,
      mean_latency_ms: null,
      mean_cost_usd: null,
      sample_size: 0,
    };
  }
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const [totalRaw, last24h, samples] = await Promise.all([
    r.get<number | string | null>("stats:total"),
    r.zcount("stats:24h", now - day, now),
    r.zrange<string[]>("stats:samples", 0, -1),
  ]);
  const total = typeof totalRaw === "number" ? totalRaw : Number(totalRaw ?? 0);

  const latencies: number[] = [];
  const costs: number[] = [];
  for (const s of samples ?? []) {
    const parts = String(s).split(":");
    if (parts.length < 3) continue;
    const lat = Number(parts[1]);
    const cost = Number(parts[2]);
    if (Number.isFinite(lat)) latencies.push(lat);
    if (Number.isFinite(cost)) costs.push(cost);
  }
  return {
    total,
    last_24h: last24h ?? 0,
    p50_latency_ms: percentile(latencies, 0.5),
    p95_latency_ms: percentile(latencies, 0.95),
    mean_latency_ms: mean(latencies),
    mean_cost_usd: mean(costs),
    sample_size: latencies.length,
  };
}

export type CopyTarget = "bullets" | "cover_letter" | "questions";

export async function recordCopyClicked(args: {
  trace_id: string;
  target: CopyTarget;
  at: number;
}): Promise<boolean> {
  const r = redis();
  if (!r) return false;
  // Idempotent: one event per (trace, target). Prevents accidental
  // double-counts from React StrictMode renders or rage-clicks.
  const setKey = `events:copy:${args.trace_id}`;
  const added = await r.sadd(setKey, args.target);
  if (added === 0) return false;
  // TTL aligns with trace TTL (PRD §12) so old traces drop together.
  await r.expire(setKey, 7 * 24 * 60 * 60);
  const p = r.pipeline();
  p.incr("events:copy_clicked:total");
  p.incr(`events:copy_clicked:by_target:${args.target}`);
  p.zadd("events:copy_clicked:24h", { score: args.at, member: `${args.trace_id}:${args.target}` });
  p.zremrangebyscore("events:copy_clicked:24h", 0, args.at - 24 * 60 * 60 * 1000);
  await p.exec();
  return true;
}

function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
