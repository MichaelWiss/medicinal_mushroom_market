// Checkout Server Action (Cell 3.3).
//
// Flow:
//   1. Authenticate the buyer (must be signed in).
//   2. Resolve the buyer's `company_id` + `tier` (or fail).
//   3. Validate the cart payload via `cartSchema`.
//   4. For each line, fetch live `available_units` (sum across passing
//      batches) — never trust the client-side count. Reject if short.
//   5. Fetch each line's species `dispatch_window`; reject if the user-
//      selected dispatch date is not allowed.
//   6. Compute `total_price` per the @repo/shared pricing engine.
//   7. Insert `orders` row (status=pending, payment_method=card) +
//      `order_items` rows (no batch_id yet — webhook allocates).
//   8. Create a Stripe Checkout Session, store its id, return its URL.
//
// Webhook handling (status → confirmed, batch allocation) lands in Cell 3.4.

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  cartSchema,
  calculateLinePrice,
  type CompanyTier,
} from '@repo/shared';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { validateCart } from '@/lib/checkout/validate-cart';
import type { TrustedLine } from '@/lib/checkout/pricing';
import { resolveSiteOrigin } from '@/lib/auth/origin';
import { requireCompany } from '@/lib/auth/require-company';
import { formatLabel } from '@/lib/data/labels';
import { track } from '@/lib/posthog/track';

const inputSchema = z.object({
  items: cartSchema,
  /** ISO yyyy-mm-dd in the user's local sense; we treat it as UTC. */
  dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CheckoutInput = z.infer<typeof inputSchema>;

export type CheckoutResult =
  | { ok: true; url: string; orderId: string }
  | { ok: false; error: string; code: CheckoutErrorCode };

export type CheckoutErrorCode =
  | 'unauthenticated'
  | 'no_company'
  | 'invalid_input'
  | 'empty_cart'
  | 'insufficient_stock'
  | 'invalid_dispatch_date'
  | 'stripe_error'
  | 'db_error';

export async function startCheckout(
  raw: CheckoutInput,
): Promise<CheckoutResult> {
  // 1. Validate shape early.
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalid_input',
      error: 'Invalid checkout payload.',
    };
  }
  const { items, dispatchDate } = parsed.data;

  if (items.length === 0) {
    return { ok: false, code: 'empty_cart', error: 'Cart is empty.' };
  }

  // 2. Auth + company lookup via the shared guard.
  const ctx = await requireCompany();
  if (!ctx.ok) {
    return {
      ok: false,
      code: ctx.code === 'unauthenticated' ? 'unauthenticated' : 'no_company',
      error:
        ctx.code === 'unauthenticated' ? 'Sign in to check out.' : ctx.error,
    };
  }
  const { userId, companyId, tier } = ctx;
  const supabase = await createClient();

  // 4. Per-line live stock + dispatch-window validation + trusted-line
  //    resolution (server-derived prices). Client-supplied `unitPrice`
  //    and `speciesName` are deliberately discarded.
  const validation = await validateCart(supabase, items, dispatchDate);
  if (!validation.ok) {
    return { ok: false, code: validation.code, error: validation.error };
  }
  const { trustedLines } = validation;

  // 5. Build per-line discounted unit amounts. The DB `total_price`
  //    mirrors what Stripe will actually charge.
  const stripeLines = trustedLines.map((l) => buildStripeLine(l, tier));
  const totalPrice = stripeLines.reduce(
    (sum, l) => sum + l.unit_amount * l.quantity,
    0,
  );

  // 6. Create the order + items.
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      company_id: companyId,
      status: 'pending',
      payment_method: 'card',
      dispatch_date: dispatchDate,
      total_price: totalPrice,
    })
    .select('id')
    .single();

  if (orderErr || !order) {
    return {
      ok: false,
      code: 'db_error',
      error: 'Could not create order.',
    };
  }

  const { error: itemsErr } = await supabase.from('order_items').insert(
    trustedLines.map((l) => ({
      order_id: order.id,
      species_id: l.speciesId,
      format: l.format,
      quantity: l.quantity,
      // Store the discounted unit price so the DB total reconciles with
      // Stripe even if discounts shift between checkout and webhook.
      // Computed from the trusted (server-derived) per-unit price.
      unit_price: Math.round(
        calculateLinePrice(l.unitPricePence, l.quantity, tier) / l.quantity,
      ),
    })),
  );

  if (itemsErr) {
    // Best-effort cleanup; if this fails the orphan order remains
    // `pending` and is surfaced via `db_error`.
    await supabase.from('orders').delete().eq('id', order.id);
    return {
      ok: false,
      code: 'db_error',
      error: 'Could not create order items.',
    };
  }

  // 7. Stripe Checkout Session.
  const origin = await resolveOrigin();
  const stripe = getStripe();
  let session: { id: string; url: string | null };
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: stripeLines.map((l) => ({
          quantity: l.quantity,
          price_data: {
            currency: 'gbp',
            unit_amount: l.unit_amount,
            product_data: { name: l.name },
          },
        })),
        success_url: `${origin}/orders?checkout=success&order_id=${order.id}`,
        cancel_url: `${origin}/cart?checkout=cancelled`,
        metadata: {
          order_id: order.id,
          company_id: companyId,
        },
        payment_intent_data: {
          metadata: {
            order_id: order.id,
            company_id: companyId,
          },
        },
      },
      { idempotencyKey: `order:${order.id}` },
    );
  } catch (err) {
    await supabase.from('orders').delete().eq('id', order.id);
    return {
      ok: false,
      code: 'stripe_error',
      error: err instanceof Error ? err.message : 'Stripe session creation failed.',
    };
  }

  if (!session.url) {
    await supabase.from('orders').delete().eq('id', order.id);
    return {
      ok: false,
      code: 'stripe_error',
      error: 'Stripe did not return a Checkout URL.',
    };
  }

  await supabase
    .from('orders')
    .update({ stripe_session_id: session.id })
    .eq('id', order.id);

  // Analytics: a checkout has been initiated. The matching
  // `checkout_completed` event lands in the Stripe webhook (Cell 3.4)
  // once the session resolves.
  track(
    'checkout_started',
    userId,
    {
      orderId: order.id,
      paymentMethod: 'card',
      totalPence: totalPrice,
      lineItemCount: items.length,
    },
    { companyId },
  );

  revalidatePath('/orders');

  return { ok: true, url: session.url, orderId: order.id };
}

// ── helpers ───────────────────────────────────────────────────

function buildStripeLine(
  l: TrustedLine,
  tier: CompanyTier,
): { name: string; quantity: number; unit_amount: number } {
  const totalLine = calculateLinePrice(l.unitPricePence, l.quantity, tier);
  // Round-half-up at the per-unit level; pence-level rounding error is
  // ≤ qty/2 across the order which is acceptable for a Phase 3 stub.
  const unitAmount = Math.round(totalLine / l.quantity);
  return {
    name: `${l.speciesName} — ${formatLabel(l.format)}`,
    quantity: l.quantity,
    unit_amount: unitAmount,
  };
}

async function resolveOrigin(): Promise<string> {
  // Delegate to the shared trusted-origin resolver. In production this
  // requires NEXT_PUBLIC_SITE_URL; in dev it falls back to a small
  // host allow-list so Stripe success/cancel URLs behave the same way
  // as magic-link redirects.
  const { headers } = await import('next/headers');
  const h = await headers();
  return resolveSiteOrigin({ headers: { get: (k: string) => h.get(k) } });
}
