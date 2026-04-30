// Stripe Subscription helpers (Cell 4.2).
//
// One Stripe Subscription per `public.subscriptions` row. Each call
// creates an ad-hoc Product + recurring Price so we don't need a
// pre-provisioned Stripe price catalogue (the species/format/tier
// matrix would be a maintenance burden). Pricing pulls from the
// shared engine so DB ↔ Stripe totals reconcile.
//
// All exports gracefully degrade when `STRIPE_SECRET_KEY` is unset:
// `createStripeSubscription` returns `null`, callers persist the row
// with a null `stripe_sub_id`, and the engine still allocates batches
// from the row. Real billing is contingent on the key being present.

import 'server-only';
import type Stripe from 'stripe';
import { calculateLinePrice, type CompanyTier } from '@repo/shared';
import { getStripe } from './server';

const FREQ_TO_INTERVAL: Record<
  'weekly' | 'biweekly' | 'monthly',
  { interval: Stripe.PriceCreateParams.Recurring.Interval; intervalCount: number }
> = {
  weekly: { interval: 'week', intervalCount: 1 },
  biweekly: { interval: 'week', intervalCount: 2 },
  monthly: { interval: 'month', intervalCount: 1 },
};

export type CreateStripeSubscriptionInput = {
  customerId: string;
  speciesName: string;
  format: string;
  /** Pence — list price per unit. Discounted via `calculateLinePrice`. */
  unitPrice: number;
  quantity: number;
  tier: CompanyTier;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  /** Mirrored into Stripe metadata for cross-system traceability. */
  subscriptionId: string;
  companyId: string;
};

/**
 * Returns the new Stripe Subscription id, or `null` when Stripe is not
 * configured (so DB-only flows still work in local dev / CI).
 */
export async function createStripeSubscription(
  input: CreateStripeSubscriptionInput,
): Promise<string | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const stripe = getStripe();

  const unitAmount =
    calculateLinePrice(input.unitPrice, input.quantity, input.tier) /
    input.quantity;

  const product = await stripe.products.create({
    name: `${input.speciesName} — ${input.format} (subscription)`,
    metadata: {
      subscription_id: input.subscriptionId,
      company_id: input.companyId,
    },
  });

  const recurring = FREQ_TO_INTERVAL[input.frequency];
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'gbp',
    unit_amount: Math.round(unitAmount),
    recurring: {
      interval: recurring.interval,
      interval_count: recurring.intervalCount,
    },
  });

  const subscription = await stripe.subscriptions.create(
    {
      customer: input.customerId,
      items: [{ price: price.id, quantity: input.quantity }],
      collection_method: 'charge_automatically',
      metadata: {
        subscription_id: input.subscriptionId,
        company_id: input.companyId,
      },
    },
    { idempotencyKey: `sub:${input.subscriptionId}` },
  );

  return subscription.id;
}

/** Pause/resume a Stripe Subscription. No-op when key/sub missing. */
export async function setStripeSubscriptionPaused(
  stripeSubId: string | null,
  paused: boolean,
): Promise<void> {
  if (!stripeSubId || !process.env.STRIPE_SECRET_KEY) return;
  const stripe = getStripe();
  await stripe.subscriptions.update(stripeSubId, {
    pause_collection: paused
      ? { behavior: 'mark_uncollectible' }
      : '',
  });
}

/** Cancel a Stripe Subscription immediately. No-op when key/sub missing. */
export async function cancelStripeSubscription(
  stripeSubId: string | null,
): Promise<void> {
  if (!stripeSubId || !process.env.STRIPE_SECRET_KEY) return;
  const stripe = getStripe();
  await stripe.subscriptions.cancel(stripeSubId);
}

/** Update the quantity of the (single) item on a Stripe Subscription. */
export async function setStripeSubscriptionQuantity(
  stripeSubId: string | null,
  quantity: number,
): Promise<void> {
  if (!stripeSubId || !process.env.STRIPE_SECRET_KEY) return;
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(stripeSubId);
  const item = sub.items.data[0];
  if (!item) return;
  await stripe.subscriptionItems.update(item.id, {
    quantity,
    proration_behavior: 'none',
  });
}
