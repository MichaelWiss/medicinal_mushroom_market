// Sentry browser config (Cell 7.2).
//
// Loaded by `instrumentation-client.ts` so it runs once on every
// client navigation entry. Gated on `NEXT_PUBLIC_SENTRY_DSN`: when
// the DSN is unset (local dev without a Sentry project) we skip
// `init()` entirely and the SDK becomes a no-op.
//
// Sample rates are tuned for free tier:
//   • `tracesSampleRate: 0.1` — 10% of transactions, enough to spot
//     hot paths without blowing the quota.
//   • `replaysSessionSampleRate: 0` — no idle session replay; only
//     replay sessions that already errored.
//   • `replaysOnErrorSampleRate: 1` — capture every errored session.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    // Browser integrations are auto-loaded; opt out of expensive ones
    // by listing them here if quota becomes a concern.
  });
}
