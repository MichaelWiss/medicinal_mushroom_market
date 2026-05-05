// Subscription server actions (Cell 4.2).
//
// CRUD for `public.subscriptions` rows + the matching Stripe
// Subscription. RLS scopes selects/updates to the caller's company,
// but we also resolve `company_id` server-side and write it
// explicitly on insert so anonymous callers can't slip through.

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCompany } from '@/lib/auth/require-company';
import { nextMonday, toISODate } from '@/lib/checkout/dispatch';
import { getOrCreateStripeCustomer } from '@/lib/stripe/customer';
import {
  cancelStripeSubscription,
  createStripeSubscription,
  setStripeSubscriptionPaused,
  setStripeSubscriptionQuantity,
} from '@/lib/stripe/subscriptions';
import { presentationFor } from '@/lib/data/species-presentation';
import { track } from '@/lib/posthog/track';

const createSchema = z.object({
  speciesId: z.string().uuid(),
  format: z.enum(['fresh', 'powder', 'spawn', 'culture', 'block']),
  quantity: z.number().int().min(1).max(10000),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  priorityTier: z.number().int().min(1).max(99).optional(),
});

export type CreateSubscriptionInput = z.infer<typeof createSchema>;

export async function createSubscription(
  raw: CreateSubscriptionInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' };
  }
  const input = parsed.data;

  const ctx = await requireCompany();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  // Resolve species name + list price for the Stripe Product/Price.
  const supabase = await createClient();
  const { data: species, error: spErr } = await supabase
    .from('species')
    .select('id, common_name, latin_name')
    .eq('id', input.speciesId)
    .maybeSingle();
  if (spErr || !species) {
    return { ok: false, error: 'Species not found' };
  }
  const presentation = presentationFor(species.latin_name);
  const unitPricePence = Math.round(presentation.price * 100);

  // Insert the row first so we have a uuid to use as the Stripe
  // metadata + idempotency key. We can fall back to clearing
  // `stripe_sub_id` if the Stripe call fails.
  const admin = createAdminClient();
  const { data: row, error: insErr } = await admin
    .from('subscriptions')
    .insert({
      company_id: ctx.companyId,
      species_id: input.speciesId,
      format: input.format,
      quantity: input.quantity,
      frequency: input.frequency,
      priority_tier: input.priorityTier ?? (ctx.tier === 'oem' ? 1 : ctx.tier === 'agreement' ? 2 : 3),
      next_dispatch: toISODate(nextMonday()),
      unit_price: unitPricePence,
      active: true,
    })
    .select('id')
    .single();
  if (insErr || !row) {
    return { ok: false, error: insErr?.message ?? 'insert failed' };
  }

  // Best-effort Stripe wiring. Failure is logged but does not roll back
  // the DB row — ops can reconcile from the Stripe dashboard.
  try {
    const customerId = await getOrCreateStripeCustomer({
      companyId: ctx.companyId,
      email: ctx.email,
    });
    const stripeSubId = await createStripeSubscription({
      customerId,
      speciesName: species.common_name,
      format: input.format,
      unitPrice: unitPricePence,
      quantity: input.quantity,
      tier: ctx.tier,
      frequency: input.frequency,
      subscriptionId: row.id,
      companyId: ctx.companyId,
    });
    if (stripeSubId) {
      await admin
        .from('subscriptions')
        .update({ stripe_sub_id: stripeSubId })
        .eq('id', row.id);
    }
  } catch (err) {
    console.error('[subscriptions] stripe create failed', {
      subscriptionId: row.id,
      error: err instanceof Error ? err.message : err,
    });
  }

  revalidatePath('/subscriptions');
  track(
    'subscription_created',
    ctx.userId,
    {
      subscriptionId: row.id,
      speciesId: input.speciesId,
      frequency: input.frequency,
      quantity: input.quantity,
    },
    { companyId: ctx.companyId },
  );
  return { ok: true, id: row.id };
}

// ── pause / resume ────────────────────────────────────────────

async function setActive(
  subscriptionId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireCompany();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const supabase = await createClient();
  // Read with RLS to prove ownership before the admin write.
  const { data: row, error: readErr } = await supabase
    .from('subscriptions')
    .select('id, stripe_sub_id, company_id')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (readErr || !row || row.company_id !== ctx.companyId) {
    return { ok: false, error: 'Not found' };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from('subscriptions')
    .update({ active })
    .eq('id', subscriptionId);
  if (updErr) return { ok: false, error: updErr.message };

  try {
    await setStripeSubscriptionPaused(row.stripe_sub_id, !active);
  } catch (err) {
    console.error('[subscriptions] stripe pause/resume failed', {
      subscriptionId,
      error: err instanceof Error ? err.message : err,
    });
  }

  revalidatePath('/subscriptions');
  return { ok: true };
}

export async function pauseSubscription(id: string) {
  return setActive(id, false);
}
export async function resumeSubscription(id: string) {
  return setActive(id, true);
}

// ── setQuantity ───────────────────────────────────────────────

export async function setSubscriptionQuantity(
  subscriptionId: string,
  quantity: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
    return { ok: false, error: 'Invalid quantity' };
  }
  const ctx = await requireCompany();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from('subscriptions')
    .select('id, stripe_sub_id, company_id')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (readErr || !row || row.company_id !== ctx.companyId) {
    return { ok: false, error: 'Not found' };
  }

  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from('subscriptions')
    .update({ quantity })
    .eq('id', subscriptionId);
  if (updErr) return { ok: false, error: updErr.message };

  try {
    await setStripeSubscriptionQuantity(row.stripe_sub_id, quantity);
  } catch (err) {
    console.error('[subscriptions] stripe quantity update failed', {
      subscriptionId,
      error: err instanceof Error ? err.message : err,
    });
  }

  revalidatePath('/subscriptions');
  return { ok: true };
}

// ── cancel (hard-delete) ──────────────────────────────────────

export async function cancelSubscription(
  subscriptionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireCompany();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const supabase = await createClient();
  const { data: row, error: readErr } = await supabase
    .from('subscriptions')
    .select('id, stripe_sub_id, company_id')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (readErr || !row || row.company_id !== ctx.companyId) {
    return { ok: false, error: 'Not found' };
  }

  // Cancel Stripe first so a transient delete failure doesn't orphan the
  // recurring billing.
  try {
    await cancelStripeSubscription(row.stripe_sub_id);
  } catch (err) {
    console.error('[subscriptions] stripe cancel failed', {
      subscriptionId,
      error: err instanceof Error ? err.message : err,
    });
  }

  const admin = createAdminClient();
  const { error: delErr } = await admin
    .from('subscriptions')
    .delete()
    .eq('id', subscriptionId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath('/subscriptions');
  return { ok: true };
}
