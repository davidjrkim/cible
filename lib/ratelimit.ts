import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Per PRD §9: 10 generations per IP per 24h, 3 per hour burst.
// We check both windows; whichever is more restrictive wins.

let _redis: Redis | null = null;
let _daily: Ratelimit | null = null;
let _hourly: Ratelimit | null = null;

function redis(): Redis | null {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function daily(): Ratelimit | null {
  if (_daily) return _daily;
  const r = redis();
  if (!r) return null;
  _daily = new Ratelimit({ redis: r, limiter: Ratelimit.fixedWindow(10, "24 h"), prefix: "cible:rl:day" });
  return _daily;
}

function hourly(): Ratelimit | null {
  if (_hourly) return _hourly;
  const r = redis();
  if (!r) return null;
  _hourly = new Ratelimit({ redis: r, limiter: Ratelimit.fixedWindow(3, "1 h"), prefix: "cible:rl:hr" });
  return _hourly;
}

export type RateLimitVerdict = {
  ok: boolean;
  window?: "hourly" | "daily";
  limit?: number;
  remaining?: number;
  reset?: number;
};

export async function checkRateLimit(ip: string): Promise<RateLimitVerdict> {
  const d = daily();
  const h = hourly();
  if (!d || !h) return { ok: true }; // not configured → fail open in dev

  const [dr, hr] = await Promise.all([d.limit(ip), h.limit(ip)]);
  if (!hr.success) return { ok: false, window: "hourly", limit: hr.limit, remaining: hr.remaining, reset: hr.reset };
  if (!dr.success) return { ok: false, window: "daily", limit: dr.limit, remaining: dr.remaining, reset: dr.reset };
  return { ok: true, remaining: Math.min(dr.remaining, hr.remaining) };
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "anon";
}
