import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getLimiters } from '@/lib/rate-limit/limiter';

// Routes that get rate-limited at the edge BEFORE Supabase session
// refresh runs. Webhooks are public (anon by definition) and invites
// are sensitive enough that we don't want anyone hammering them.
const RATE_LIMITED_PREFIXES = ['/api/webhooks/', '/api/invites'];

function shouldRateLimit(pathname: string): boolean {
  return RATE_LIMITED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p),
  );
}

function clientIp(request: NextRequest): string {
  // Vercel sets `x-forwarded-for` as a comma-separated list with the
  // client IP first. Fall back to the platform-injected `request.ip`
  // (Edge runtime), then to a constant so the limiter still keys
  // *something* in dev.
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  // `NextRequest.ip` exists at runtime on Vercel Edge but not in the
  // current type defs across all Next versions — use a safe lookup.
  const ip = (request as unknown as { ip?: string }).ip;
  return ip ?? 'unknown';
}

function rateLimitResponse(reset: number, limit: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return new NextResponse('Rate limit exceeded', {
    status: 429,
    headers: {
      'retry-after': String(retryAfter),
      'x-ratelimit-limit': String(limit),
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': String(Math.ceil(reset / 1000)),
    },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldRateLimit(pathname)) {
    // Distinguish authenticated vs anonymous via the Supabase session
    // cookie. We don't decode the JWT here — presence of the
    // `sb-*-auth-token` cookie is sufficient to bump the user into the
    // higher (60/min) bucket. Per-IP keying is used in both cases so
    // a single user across multiple machines still gets independent
    // budgets — adjust to per-user keying if needed by reading the
    // Supabase session in middleware (heavier).
    const { anon, authed } = getLimiters();
    const hasSession = request.cookies
      .getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'));
    const limiter = hasSession ? authed : anon;
    const ip = clientIp(request);
    const result = await limiter.limit(`${pathname}:${ip}`);
    if (!result.success) {
      return rateLimitResponse(result.reset, result.limit);
    }
  }

  return updateSession(request);
}

// Run on every request except Next.js internals and static assets.
// Auth callback + sign-in must be reachable, so we exclude them by path
// prefix logic inside `updateSession` rather than here.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
