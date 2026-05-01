// Sentry edge config (Cell 7.2).
//
// Loaded by `instrumentation.ts` for the Edge runtime (middleware,
// any route handlers configured with `runtime = 'edge'`). The Edge
// runtime is V8-isolate based, so we use the `@sentry/nextjs` edge
// build which avoids Node-only APIs.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
