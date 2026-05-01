// Edge-runtime rate limiter (Cell 7.3).
//
// Wraps `@upstash/ratelimit` with a graceful degradation path:
//   • When `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are
//     configured, we use a sliding-window limiter backed by Upstash
//     Redis (free tier is plenty for our traffic profile).
//   • Otherwise we fall back to an in-memory Map keyed limiter so
//     local `pnpm dev` and CI still get sensible behaviour without
//     external infra. The in-memory limiter is per-instance — fine
//     for dev, useless for protecting production. The middleware
//     loudly logs once at boot when the fallback is active.
//
// Two limiter buckets are exposed:
//   • `anon`  — 10 req / minute / IP  (unauthenticated)
//   • `authed` — 60 req / minute / user  (authenticated)
//
// Both run as sliding windows so bursts don't get a free pass at the
// edge of a fixed window.

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

type Limiter = {
  limit: (key: string) => Promise<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }>;
};

let cached: { anon: Limiter; authed: Limiter } | null = null;

export function getLimiters(): { anon: Limiter; authed: Limiter } {
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const redis = new Redis({ url, token });
    cached = {
      anon: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, '60 s'),
        analytics: false,
        prefix: 'rl:anon',
      }),
      authed: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, '60 s'),
        analytics: false,
        prefix: 'rl:authed',
      }),
    };
    return cached;
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN unset — using in-memory fallback (per-instance, not safe for production).',
  );
  cached = {
    anon: makeMemoryLimiter(10, 60_000),
    authed: makeMemoryLimiter(60, 60_000),
  };
  return cached;
}

// ── in-memory fallback ────────────────────────────────────────

function makeMemoryLimiter(max: number, windowMs: number): Limiter {
  const buckets = new Map<string, number[]>();
  return {
    async limit(key: string) {
      const now = Date.now();
      const cutoff = now - windowMs;
      const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
      hits.push(now);
      buckets.set(key, hits);
      const success = hits.length <= max;
      return {
        success,
        limit: max,
        remaining: Math.max(0, max - hits.length),
        reset: now + windowMs,
      };
    },
  };
}
