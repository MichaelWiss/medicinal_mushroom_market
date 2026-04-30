// Shippo tracking helpers (Cell 6.1).
//
// `registerTracking` opts a (carrier, tracking_number) pair into Shippo's
// webhook fan-out so that `/api/webhooks/shippo` (Cell 6.3) receives
// `track_updated` events. `getTracking` is a manual-poll fallback.
//
// `mapShippoStatusToOrderStatus` is the single source of truth used by both
// the webhook handler and any future ops dashboard polling.

import 'server-only';
import type { OrderStatus } from '@repo/shared';
import { getShippoClient } from './client';

export interface RegisterTrackingInput {
  carrier: string;        // e.g. 'usps', 'ups', 'fedex' — Shippo's slug
  trackingNumber: string;
  /** Optional metadata string echoed back on every webhook event. */
  metadata?: string;
}

interface ShippoTrack {
  carrier: string;
  tracking_number: string;
  tracking_status: { status: string; status_date?: string } | null;
  metadata?: string | null;
}

export async function registerTracking(
  input: RegisterTrackingInput,
): Promise<void> {
  const client = getShippoClient();
  if (!client.available) return;

  await client.request<unknown>('/tracks/', {
    method: 'POST',
    body: JSON.stringify({
      carrier: input.carrier,
      tracking_number: input.trackingNumber,
      metadata: input.metadata,
    }),
  });
}

export async function getTracking(
  carrier: string,
  trackingNumber: string,
): Promise<ShippoTrack | null> {
  const client = getShippoClient();
  if (!client.available) return null;

  return client.request<ShippoTrack>(
    `/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`,
  );
}

/**
 * Map Shippo `tracking_status.status` (uppercase, see
 * https://docs.goshippo.com/docs/tracking/tracking/) to a Mycelium
 * `OrderStatus`. Returns `null` for statuses that should not transition the
 * order (e.g. `UNKNOWN`, `PRE_TRANSIT` — already handled by the dispatch
 * Server Action in Cell 6.2).
 */
export function mapShippoStatusToOrderStatus(
  status: string,
): OrderStatus | null {
  switch (status.toUpperCase()) {
    case 'TRANSIT':
      return 'dispatched';
    case 'DELIVERED':
      return 'delivered';
    case 'RETURNED':
    case 'FAILURE':
      return 'cancelled';
    default:
      return null;
  }
}
