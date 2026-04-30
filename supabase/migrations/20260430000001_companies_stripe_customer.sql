-- Cell 4.2 — Stripe customer mapping for recurring billing.
--
-- Adds a nullable `stripe_customer_id` to `companies` so the
-- subscription engine can attach Stripe Subscriptions / Invoices to a
-- single per-company Stripe Customer regardless of which buyer placed
-- the underlying order. Backfilled lazily on first subscription
-- creation by `getOrCreateStripeCustomer()` in
-- `apps/web/lib/stripe/customer.ts`.

alter table public.companies
  add column if not exists stripe_customer_id text unique;

comment on column public.companies.stripe_customer_id is
  'Stripe Customer ID (cus_…). Created lazily on first subscription.';
