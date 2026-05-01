// Sentry server config (Cell 7.2).
//
// Loaded by `instrumentation.ts` for the Node.js runtime — covers
// Server Components, Server Actions, route handlers, and the Stripe /
// Shippo webhook handlers. Gated on `SENTRY_DSN` so missing creds
// don't break local dev.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Don't capture PII unless we explicitly attach it via
    // `Sentry.setUser()` — Supabase auth handlers can call that on
    // their own where appropriate.
    sendDefaultPii: false,
  });
}
