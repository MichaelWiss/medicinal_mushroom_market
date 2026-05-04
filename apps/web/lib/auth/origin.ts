// Trusted origin resolver (security plan step 8).
//
// Magic-link redirects, Stripe success/cancel URLs, and invite emails
// must all point at our own site. The pre-step-8 implementations
// derived an origin from `Host` / `x-forwarded-host` whenever
// `NEXT_PUBLIC_SITE_URL` was unset. A reverse proxy (or test harness)
// that fails to validate `Host` headers can therefore mint links that
// hand session cookies, success pages, or invites to an attacker-
// controlled domain.
//
// `resolveSiteOrigin` centralises the policy:
//
//   1. If `NEXT_PUBLIC_SITE_URL` is set, return it (trimmed).
//   2. Otherwise, in production (`process.env.NODE_ENV === 'production'`),
//      throw — operators must configure the site URL explicitly.
//   3. Otherwise (dev / test), fall back to `${proto}://${host}` derived
//      from the request, but reject hosts that are not on a small
//      allow-list. The allow-list defaults to `localhost`, `127.0.0.1`
//      (any port) and can be extended via the comma-separated
//      `NEXT_PUBLIC_DEV_ORIGIN_ALLOWLIST` env var.

import 'server-only';

const DEFAULT_DEV_ALLOWLIST = ['localhost', '127.0.0.1'];

export class UntrustedOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UntrustedOriginError';
  }
}

export type RequestLike = {
  headers: { get(name: string): string | null };
  url?: string;
};

/** Read `NEXT_PUBLIC_SITE_URL` and strip a trailing slash if present. */
function configuredSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production';
}

function devAllowlist(): string[] {
  const extra = process.env.NEXT_PUBLIC_DEV_ORIGIN_ALLOWLIST;
  if (!extra) return DEFAULT_DEV_ALLOWLIST;
  return [
    ...DEFAULT_DEV_ALLOWLIST,
    ...extra
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ];
}

function hostnameOf(host: string): string {
  // host may include a port (e.g. localhost:3000); strip it for the
  // allow-list check. IPv6 brackets are preserved.
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    return close === -1 ? host : host.slice(0, close + 1);
  }
  const colon = host.indexOf(':');
  return colon === -1 ? host : host.slice(0, colon);
}

/**
 * Resolves the canonical site origin (scheme + host + optional port,
 * no trailing slash). Throws `UntrustedOriginError` if the inputs are
 * insufficient to safely produce one.
 */
export function resolveSiteOrigin(req?: RequestLike): string {
  const fromEnv = configuredSiteUrl();
  if (fromEnv) return fromEnv;

  if (isProd()) {
    throw new UntrustedOriginError(
      'NEXT_PUBLIC_SITE_URL must be set in production. ' +
        'Refusing to derive an origin from request headers.',
    );
  }

  // Dev / test: allow a small set of trusted local hosts.
  const headers = req?.headers;
  const hostHeader =
    (headers?.get('x-forwarded-host') ?? headers?.get('host') ?? '').trim();
  if (!hostHeader) {
    // No request available (e.g. background job): fall back to the
    // local Next dev port.
    return 'http://localhost:3000';
  }
  const host = hostHeader.split(',')[0]!.trim();
  const allow = devAllowlist();
  if (!allow.includes(hostnameOf(host))) {
    throw new UntrustedOriginError(
      `Host header "${host}" is not on the dev allow-list. ` +
        'Set NEXT_PUBLIC_SITE_URL or extend NEXT_PUBLIC_DEV_ORIGIN_ALLOWLIST.',
    );
  }
  const proto = (headers?.get('x-forwarded-proto') ?? '').trim() || 'http';
  return `${proto}://${host}`;
}
