// Server-side PostHog client (Cell 7.1).
//
// Used by Server Actions, route handlers, and the Stripe / Shippo
// webhook handlers — anywhere a backend event needs to be captured
// against an authenticated user (or anonymous via a stable
// distinct_id derived from the order id, etc.).
//
// Pattern mirrors `lib/email/client.ts`:
//   • Singleton (cold-start friendly on Vercel).
//   • No-op shim when `POSTHOG_KEY` is unset, so local dev without a
//     PostHog project keeps working.
//   • Capture is fire-and-forget — never block a server action on
//     analytics. `flushAsync` is exposed for places where we want
//     to drain before the function returns (e.g. webhook handlers
//     in serverless environments).

import 'server-only';
import { PostHog } from 'posthog-node';

type ServerClient = {
  available: boolean;
  capture: (event: {
    distinctId: string;
    event: string;
    properties?: Record<string, unknown>;
    groups?: Record<string, string>;
  }) => void;
  flushAsync: () => Promise<void>;
};

let cached: ServerClient | null = null;

export function getServerPostHog(): ServerClient {
  if (cached) return cached;

  // Public host so server + browser hit the same project / region.
  const key = process.env.POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

  if (!key) {
    cached = {
      available: false,
      capture: ({ event, distinctId }) => {
        // eslint-disable-next-line no-console
        console.log(
          `[posthog] POSTHOG_KEY unset — skipping capture ${event} (${distinctId})`,
        );
      },
      flushAsync: async () => undefined,
    };
    return cached;
  }

  // `flushAt: 1` keeps the client serverless-friendly: each capture is
  // shipped immediately rather than batched in memory, so we don't lose
  // events when the function instance freezes.
  const client = new PostHog(key, {
    host,
    flushAt: 1,
    flushInterval: 0,
  });

  cached = {
    available: true,
    capture: ({ distinctId, event, properties, groups }) => {
      try {
        client.capture({
          distinctId,
          event,
          properties: properties ?? {},
          ...(groups ? { groups } : {}),
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[posthog] capture failed for ${event}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
    flushAsync: async () => {
      try {
        await client.shutdown();
      } catch {
        // ignore — analytics never fails a request
      }
    },
  };
  return cached;
}
