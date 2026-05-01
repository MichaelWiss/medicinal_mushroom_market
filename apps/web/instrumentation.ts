// Next.js instrumentation hook (Cell 7.2).
//
// Loads the Sentry server/edge config on the matching runtime. Next.js
// invokes `register()` exactly once per runtime instance at boot time.
// The `onRequestError` hook forwards Server Component / route handler
// errors to Sentry — without it, errors thrown inside React Server
// rendering aren't captured.

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
