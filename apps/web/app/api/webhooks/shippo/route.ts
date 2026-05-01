// Shippo webhook handler (Cell 6.3).
//
// Flow:
//   1. Read the raw request body (required for HMAC signature
//      verification — Next.js route handlers do not pre-parse the body,
//      so `request.text()` returns the verbatim payload).
//   2. Verify the `shippo-signature` header is an HMAC-SHA256 hex digest
//      of the raw body using `SHIPPO_WEBHOOK_SECRET`. Constant-time
//      compare to avoid timing leaks.
//   3. Parse + validate the payload with `shippoWebhookSchema` from
//      `@repo/shared`.
//   4. On `track_updated` (the only event we care about in v1):
//        a. Resolve the Mycelium order — preferred via `data.metadata`
//           JSON `{order_id}` (set by `createLabel` in Cell 6.1), with a
//           fallback to `orders.tracking_number = data.tracking_number`
//           in case the metadata round-trip is dropped by a carrier.
//        b. Map Shippo status → `OrderStatus` via the canonical helper
//           from `lib/shippo/tracking.ts`. Unknown / non-actionable
//           statuses (PRE_TRANSIT, UNKNOWN, …) are acknowledged with no
//           DB write so Shippo doesn't retry.
//        c. Validate the transition with `canTransitionOrder` from
//           `@repo/shared/state` and patch with a `WHERE status = <prev>`
//           predicate so concurrent admin actions cannot be clobbered.
//   5. Always return 200 once the event is acknowledged so Shippo does
//      not retry. Signature failures return 400 (Shippo will retry —
//      desired).
//
// Security notes:
//   - This route uses the service-role Supabase client (no end-user
//     session on a webhook). It lives outside `(storefront)/(dashboard)`
//     so the ESLint admin-client guard does not apply.
//   - We trust ONLY the metadata.order_id / tracking_number after
//     verifying the signature; status is mapped through a closed allow-list.
//   - Shippo does not (yet) sign every webhook by default in their
//     dashboard; setting up the shared secret is documented in the
//     Cell 6.3 README and `.env.local.example`.

import 'server-only';
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  shippoWebhookSchema,
  canTransitionOrder,
  type OrderStatus,
  type ShippoWebhookPayload,
} from '@repo/shared';
import { createAdminClient } from '@/lib/supabase/admin';
import { mapShippoStatusToOrderStatus } from '@/lib/shippo/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNATURE_HEADERS = [
  'x-shippo-signature',
  'shippo-signature',
  'x-shippo-webhook-signature',
] as const;

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[shippo-webhook] SHIPPO_WEBHOOK_SECRET is not set');
    return new NextResponse('Webhook not configured', { status: 500 });
  }

  const signature = readSignature(request.headers);
  if (!signature) {
    return new NextResponse('Missing shippo-signature header', { status: 400 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, signature, secret)) {
    console.error('[shippo-webhook] signature verification failed');
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let payload: ShippoWebhookPayload;
  try {
    payload = shippoWebhookSchema.parse(JSON.parse(rawBody));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[shippo-webhook] payload parse failed:', msg);
    // 200 — a malformed payload that we can't re-process is best
    // acknowledged so Shippo doesn't retry indefinitely.
    return NextResponse.json({ received: true, error: 'invalid payload' });
  }

  try {
    if (payload.event === 'track_updated') {
      await handleTrackUpdated(payload);
    }
    // Other Shippo events (transaction.created, etc.) are acknowledged
    // without action.
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error(`[shippo-webhook] handler error for ${payload.event}:`, msg);
    return new NextResponse(`Handler error: ${msg}`, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── helpers ──────────────────────────────────────────────────

function readSignature(headers: Headers): string | null {
  for (const name of SIGNATURE_HEADERS) {
    const v = headers.get(name);
    if (v) return v.trim();
  }
  return null;
}

function verifySignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // Strip an optional `sha256=` prefix some senders use.
  const provided = signature.replace(/^sha256=/i, '');
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(provided, 'hex'),
    );
  } catch {
    return false;
  }
}

function extractOrderId(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const obj = JSON.parse(metadata) as Record<string, unknown>;
    if (typeof obj.order_id === 'string') return obj.order_id;
  } catch {
    // metadata may be an opaque string for legacy parcels
  }
  return null;
}

// ── handlers ──────────────────────────────────────────────────

async function handleTrackUpdated(
  payload: ShippoWebhookPayload,
): Promise<void> {
  const supabase = createAdminClient();

  const orderId =
    extractOrderId(payload.data.metadata ?? null) ??
    (await lookupOrderIdByTracking(payload.data.tracking_number));

  if (!orderId) {
    console.warn('[shippo-webhook] no Mycelium order matched', {
      tracking: payload.data.tracking_number,
    });
    return;
  }

  const next = mapShippoStatusToOrderStatus(payload.data.tracking_status.status);
  if (!next) {
    // PRE_TRANSIT / UNKNOWN / etc. — acknowledge without a DB write.
    return;
  }

  const { data: order, error: readErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();
  if (readErr || !order) {
    console.error('[shippo-webhook] order not found', {
      orderId,
      readErr,
    });
    return;
  }

  if (order.status === next) {
    // Idempotent re-delivery.
    return;
  }

  if (!canTransitionOrder(order.status, next)) {
    console.warn('[shippo-webhook] illegal transition; skipping', {
      orderId,
      from: order.status,
      to: next,
    });
    return;
  }

  // Predicate on current status to defeat concurrent admin actions.
  const { data: updated, error: updErr } = await supabase
    .from('orders')
    .update({ status: next satisfies OrderStatus })
    .eq('id', order.id)
    .eq('status', order.status)
    .select('id, status')
    .maybeSingle();
  if (updErr) {
    console.error('[shippo-webhook] order update failed', { orderId, updErr });
    return;
  }
  if (!updated) {
    // Concurrent transition raced us; the realtime subscription will
    // surface the winner. Acknowledge the webhook so Shippo doesn't
    // retry.
    console.warn('[shippo-webhook] concurrent transition; skipped write', {
      orderId,
    });
  }
}

async function lookupOrderIdByTracking(
  trackingNumber: string,
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('orders')
    .select('id')
    .eq('tracking_number', trackingNumber)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}
