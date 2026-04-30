// Per-company Stripe Customer mapping (Cell 4.2).
//
// Recurring billing requires a Stripe Customer. We use one Customer per
// company (not per buyer) so all subscriptions / invoices roll up under
// the company that placed them. The id is cached on
// `companies.stripe_customer_id` (added in migration
// `20260430000001_companies_stripe_customer.sql`) and created lazily on
// first subscription.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStripe } from './server';

export type GetOrCreateInput = {
  companyId: string;
  /** Used as the Stripe Customer email when creating a new record. */
  email?: string | null;
};

export async function getOrCreateStripeCustomer({
  companyId,
  email,
}: GetOrCreateInput): Promise<string> {
  const supabase = createAdminClient();

  const { data: company, error } = await supabase
    .from('companies')
    .select('id, name, stripe_customer_id')
    .eq('id', companyId)
    .maybeSingle();
  if (error || !company) {
    throw new Error(
      `getOrCreateStripeCustomer: company ${companyId} not found (${
        error?.message ?? 'no row'
      })`,
    );
  }
  if (company.stripe_customer_id) return company.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: company.name,
    ...(email ? { email } : {}),
    metadata: { company_id: companyId },
  });

  const { error: updErr } = await supabase
    .from('companies')
    .update({ stripe_customer_id: customer.id })
    .eq('id', companyId);
  if (updErr) {
    // Customer was created in Stripe but not persisted — surface so we can
    // reconcile rather than silently double-create on the next call.
    throw new Error(
      `getOrCreateStripeCustomer: failed to persist stripe_customer_id (${updErr.message})`,
    );
  }
  return customer.id;
}
