// Stripe webhook handler (Cell 3.4).
//
// Flow:
//   1. Read the raw request body (required for signature verification —
//      Next.js App Router route handlers do not pre-parse the body, so
//      `request.text()` returns the verbatim payload).
//   2. Verify the Stripe signature using STRIPE_WEBHOOK_SECRET.
//   3. On `checkout.session.completed`:
//        a. Read `metadata.order_id` (set in Cell 3.3).
//        b. Idempotency: if the order is already non-pending, no-op.
//        c. For each `order_items` row, call the race-safe
//           `allocate_batch(p_species_id, p_qty)` RPC.
//        d. If any line fails to allocate → leave the order in `pending`
//           and log a backorder marker (Resend wiring lands in Phase 4).
//        e. Otherwise, write `batch_id` + `allocated_at` per line and
//           transition the order to `confirmed`.
//   4. Always return 200 to Stripe once the event is acknowledged so the
//      delivery is not retried indefinitely. Signature failures return
//      400 (Stripe will retry — desired).
//
// Security notes:
//   - The route uses the service-role Supabase client because there is no
//     end-user session on a webhook call. This file lives outside
//     `(storefront)/(dashboard)` so the ESLint admin-client guard does
//     not apply.
//   - We trust ONLY `metadata.order_id` after verifying the signature;
//     amounts and line items are not re-derived from the Stripe payload.

import 'server-only';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from '@/lib/stripe/server';
import { getCompanyEmails } from '@/lib/email/recipients';
import {
  orderUrl,
  sendBackorderNotice,
  sendOrderConfirmation,
} from '@/lib/email/send';
import { track, flushPostHog } from '@/lib/posthog/track';

// Force the Node.js runtime — the Stripe SDK relies on Node crypto for
// signature verification and `stream` APIs not available on the Edge
// runtime.
export const runtime = 'nodejs';
// Webhooks must never be cached.
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set');
    return new NextResponse('Webhook not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new NextResponse('Missing stripe-signature header', { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[stripe-webhook] signature verification failed:', msg);
    return new NextResponse(`Invalid signature: ${msg}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object);
        break;
      }
      // Other events (payment_intent.*, charge.refunded, …) land in
      // later cells. Acknowledge to avoid retries.
      default:
        break;
    }
  } catch (err) {
    // Surface handler errors so Stripe retries delivery, but log loudly.
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error(`[stripe-webhook] handler error for ${event.type}:`, msg);
    await flushPostHog();
    return new NextResponse(`Handler error: ${msg}`, { status: 500 });
  }

  await flushPostHog();
  return NextResponse.json({ received: true });
}

// ── handlers ──────────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const orderId = session.metadata?.order_id;
  if (!orderId) {
    console.error(
      '[stripe-webhook] checkout.session.completed missing metadata.order_id',
      { sessionId: session.id },
    );
    return;
  }

  const supabase = createAdminClient();

  // Idempotency: a re-delivery of the same event must be a no-op once
  // the order has moved past `pending`.
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, company_id, total_price, dispatch_date')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) {
    console.error('[stripe-webhook] order not found', { orderId, orderErr });
    return;
  }

  if (order.status !== 'pending') {
    // Already processed (or manually advanced) — nothing to do.
    return;
  }

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('id, species_id, quantity, unit_price, format, batch_id, species:species_id(common_name)')
    .eq('order_id', orderId);

  if (itemsErr || !items || items.length === 0) {
    console.error('[stripe-webhook] order has no items', {
      orderId,
      itemsErr,
    });
    return;
  }

  // Allocate each line via the race-safe RPC. We do NOT short-circuit on
  // first failure: every line is attempted so we can record partial
  // allocations and leave the order `pending` for ops to resolve.
  const allocations: Array<{
    itemId: string;
    batchId: string | null;
  }> = [];

  for (const item of items) {
    if (item.batch_id) {
      // Already allocated (re-delivery race after a partial commit).
      allocations.push({ itemId: item.id, batchId: item.batch_id });
      continue;
    }
    const { data: batchId, error: rpcErr } = await supabase.rpc(
      'allocate_batch',
      { p_species_id: item.species_id, p_qty: item.quantity },
    );
    if (rpcErr) {
      console.error('[stripe-webhook] allocate_batch RPC error', {
        orderId,
        itemId: item.id,
        rpcErr,
      });
      allocations.push({ itemId: item.id, batchId: null });
      continue;
    }
    allocations.push({ itemId: item.id, batchId: batchId ?? null });
  }

  const failed = allocations.filter((a) => a.batchId === null);

  // Persist whatever we DID allocate so a later retry can finish the rest.
  const allocatedAt = new Date().toISOString();
  for (const a of allocations) {
    if (!a.batchId) continue;
    const { error: updErr } = await supabase
      .from('order_items')
      .update({ batch_id: a.batchId, allocated_at: allocatedAt })
      .eq('id', a.itemId)
      // Only patch rows that don't already carry a batch (idempotency).
      .is('batch_id', null);
    if (updErr) {
      console.error('[stripe-webhook] order_items update failed', {
        orderId,
        itemId: a.itemId,
        updErr,
      });
      continue;
    }
    const row = items.find((i) => i.id === a.itemId);
    if (row) {
      track(
        'batch_allocated',
        orderId,
        {
          orderId,
          orderItemId: a.itemId,
          speciesId: row.species_id,
          batchId: a.batchId,
          quantity: row.quantity,
        },
        { companyId: order.company_id },
      );
    }
  }

  if (failed.length > 0) {
    // Backorder path. Email buyers so they know we're short on stock and
    // leave the order in `pending` for the next webhook re-delivery (or
    // ops intervention) to finish allocating.
    console.warn('[stripe-webhook] backorder: leaving order pending', {
      orderId,
      failedItems: failed.map((f) => f.itemId),
    });
    for (const f of failed) {
      const row = items.find((i) => i.id === f.itemId);
      if (!row) continue;
      track(
        'backorder_triggered',
        orderId,
        {
          orderId,
          speciesId: row.species_id,
          quantity: row.quantity,
        },
        { companyId: order.company_id },
      );
    }
    const failedSpecies = failed
      .map((f) => items.find((i) => i.id === f.itemId))
      .map((row) => {
        const sp = row?.species as { common_name?: string } | null | undefined;
        return sp?.common_name ?? 'Unknown species';
      });
    const recipients = await getCompanyEmails(order.company_id);
    for (const to of recipients) {
      const result = await sendBackorderNotice(to, {
        orderRef: orderId,
        speciesNames: failedSpecies,
        orderUrl: orderUrl(orderId),
      });
      if (!result.ok) {
        console.error('[stripe-webhook] backorder email failed', {
          orderId,
          to,
          error: result.error,
        });
      }
    }
    return;
  }

  const { error: confirmErr } = await supabase
    .from('orders')
    .update({ status: 'confirmed' })
    .eq('id', orderId)
    // Guard against racing with another delivery that already advanced.
    .eq('status', 'pending');

  if (confirmErr) {
    console.error('[stripe-webhook] order confirm failed', {
      orderId,
      confirmErr,
    });
    return;
  }

  // Funnel: order has been fully paid + allocated.
  track(
    'checkout_completed',
    orderId,
    {
      orderId,
      paymentMethod: 'card',
      totalPence: order.total_price,
      lineItemCount: items.length,
    },
    { companyId: order.company_id },
  );

  // Order is fully allocated and confirmed — send order-confirmation
  // mail to every buyer associated with the company.
  const recipients = await getCompanyEmails(order.company_id);
  if (recipients.length === 0) return;
  const lines = items.map((item) => {
    const sp = item.species as { common_name?: string } | null | undefined;
    return {
      speciesName: sp?.common_name ?? 'Unknown species',
      format: item.format,
      quantity: item.quantity,
      unitPrice: item.unit_price,
    };
  });
  for (const to of recipients) {
    const result = await sendOrderConfirmation(to, {
      orderRef: orderId,
      totalPrice: order.total_price,
      dispatchDate: order.dispatch_date,
      lines,
      orderUrl: orderUrl(orderId),
    });
    if (!result.ok) {
      console.error('[stripe-webhook] confirmation email failed', {
        orderId,
        to,
        error: result.error,
      });
    }
  }
}
