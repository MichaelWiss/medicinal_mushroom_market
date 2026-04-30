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
  type CartItemInput,
  type CompanyTier,
} from '@repo/shared';
import { createClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
import { isDispatchAllowed } from '@/lib/checkout/dispatch';

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

  // 2. Auth.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: 'unauthenticated',
      error: 'Sign in to check out.',
    };
  }

  // 3. Resolve company + tier.
  const { data: membership, error: memErr } = await supabase
    .from('company_users')
    .select('company_id, companies(id, tier)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (memErr || !membership?.company_id) {
    return {
      ok: false,
      code: 'no_company',
      error: 'No company is linked to this account.',
    };
  }
  const companyId = membership.company_id;
  const tier =
    ((membership.companies as { tier: CompanyTier } | null)?.tier ?? 'spot') as
      CompanyTier;

  // 4. Per-line live stock + dispatch-window validation.
  const speciesIds = Array.from(new Set(items.map((i) => i.speciesId)));

  const [{ data: speciesRows, error: speciesErr },
         { data: batchRows, error: batchErr }] = await Promise.all([
    supabase
      .from('species')
      .select('id, common_name, dispatch_window')
      .in('id', speciesIds),
    supabase
      .from('batches')
      .select('species_id, available_units, contamination_check')
      .in('species_id', speciesIds)
      .eq('contamination_check', 'pass'),
  ]);

  if (speciesErr || batchErr || !speciesRows) {
    return {
      ok: false,
      code: 'db_error',
      error: 'Could not validate cart against current stock.',
    };
  }

  const speciesById = new Map(speciesRows.map((s) => [s.id, s]));
  const stockBySpecies = new Map<string, number>();
  for (const b of batchRows ?? []) {
    stockBySpecies.set(
      b.species_id,
      (stockBySpecies.get(b.species_id) ?? 0) + (b.available_units ?? 0),
    );
  }

  const dispatchUTC = new Date(`${dispatchDate}T00:00:00.000Z`);
  if (Number.isNaN(dispatchUTC.getTime())) {
    return {
      ok: false,
      code: 'invalid_dispatch_date',
      error: 'Invalid dispatch date.',
    };
  }

  // Aggregate quantity per species for stock check (a species may appear
  // in multiple lines via different formats).
  const requestedBySpecies = new Map<string, number>();
  for (const it of items) {
    requestedBySpecies.set(
      it.speciesId,
      (requestedBySpecies.get(it.speciesId) ?? 0) + it.quantity,
    );
  }

  for (const [speciesId, requested] of requestedBySpecies) {
    const sp = speciesById.get(speciesId);
    if (!sp) {
      return {
        ok: false,
        code: 'invalid_input',
        error: 'Unknown species in cart.',
      };
    }
    const stock = stockBySpecies.get(speciesId) ?? 0;
    if (stock < requested) {
      return {
        ok: false,
        code: 'insufficient_stock',
        error: `Insufficient stock for ${sp.common_name}. Available: ${stock}.`,
      };
    }
    if (!isDispatchAllowed(sp.dispatch_window, dispatchUTC)) {
      return {
        ok: false,
        code: 'invalid_dispatch_date',
        error: `${sp.common_name} cannot dispatch on the selected date (allowed: ${sp.dispatch_window.join(', ')}).`,
      };
    }
  }

  // 5. Build per-line discounted unit amounts (rounded so Stripe ↔ DB
  //    stay in sync). The DB `total_price` mirrors what Stripe will
  //    actually charge.
  const stripeLines = items.map((it) => buildStripeLine(it, tier));
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
    items.map((it) => ({
      order_id: order.id,
      species_id: it.speciesId,
      format: it.format,
      quantity: it.quantity,
      // Store the discounted unit price so the DB total reconciles with
      // Stripe even if discounts shift between checkout and webhook.
      unit_price: Math.round(
        calculateLinePrice(it.unitPrice, it.quantity, tier) / it.quantity,
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

  revalidatePath('/orders');

  return { ok: true, url: session.url, orderId: order.id };
}

// ── helpers ───────────────────────────────────────────────────

function buildStripeLine(
  it: CartItemInput,
  tier: CompanyTier,
): { name: string; quantity: number; unit_amount: number } {
  const totalLine = calculateLinePrice(it.unitPrice, it.quantity, tier);
  // Round-half-up at the per-unit level; pence-level rounding error is
  // ≤ qty/2 across the order which is acceptable for a Phase 3 stub.
  const unitAmount = Math.round(totalLine / it.quantity);
  return {
    name: `${it.speciesName} — ${formatLabel(it.format)}`,
    quantity: it.quantity,
    unit_amount: unitAmount,
  };
}

function formatLabel(f: CartItemInput['format']): string {
  switch (f) {
    case 'fresh':   return 'Fresh fruiting body';
    case 'powder':  return 'Dried powder';
    case 'spawn':   return 'Grain spawn';
    case 'culture': return 'Liquid culture';
    case 'block':   return 'Substrate block';
  }
}

async function resolveOrigin(): Promise<string> {
  // Prefer an explicit env so success/cancel URLs work behind tunnels.
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  }
  const { headers } = await import('next/headers');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}
