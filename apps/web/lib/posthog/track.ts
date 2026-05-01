// Strongly-typed `track()` helper for server-side captures (Cell 7.1).
//
// Routes every backend event through `getServerPostHog()` so the
// `POSTHOG_KEY`-unset no-op shim and the singleton lifecycle stay
// centralised.
//
// Usage:
//   await track('checkout_completed', orderId, {
//     orderId, paymentMethod, totalPence, lineItemCount,
//   }, { companyId });
//
// `distinctId` should be the Supabase `auth.users.id` whenever
// available, so server-side events deduplicate against browser-side
// `posthog.identify(userId)` calls. For unauthenticated paths use a
// stable id (order id, anon id from the request, …).
//
// `groupKey` lets us group events by company so PostHog can cohort
// usage by tenant.

import 'server-only';
import { getServerPostHog } from './client';
import type { PHEventName, PHEventProps } from './events';

export type TrackGroups = {
  companyId?: string;
};

export function track<E extends PHEventName>(
  event: E,
  distinctId: string,
  properties: PHEventProps[E],
  groups?: TrackGroups,
): void {
  const ph = getServerPostHog();
  ph.capture({
    distinctId,
    event,
    properties: properties as Record<string, unknown>,
    ...(groups?.companyId ? { groups: { company: groups.companyId } } : {}),
  });
}

/**
 * Drains the in-memory queue. Call from webhook handlers (Stripe,
 * Shippo) right before returning the response — serverless runtimes
 * may freeze the function as soon as the response is written, dropping
 * pending captures.
 */
export async function flushPostHog(): Promise<void> {
  await getServerPostHog().flushAsync();
}
