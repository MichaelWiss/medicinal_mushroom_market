-- =============================================================
-- 20260504000002_rls_tighten.sql
-- RLS write tightening (security plan step 4).
--
-- Background. The original policies in 20260427000001_rls.sql granted
-- broad write access to authenticated users on:
--   • companies          UPDATE        (any column, including `tier`,
--                                       `net30_enabled`, `stripe_customer_id`)
--   • subscriptions      ALL           (insert/update/delete with no
--                                       column restrictions, including
--                                       `unit_price`)
--   • quotes             ALL           (insert pre-approved quotes with
--                                       any line_items)
--   • orders             INSERT        (any status / payment_method /
--                                       total_price)
--
-- Combined with `enable_signup = true` (now disabled in supabase/config.toml)
-- this allowed any authenticated user to:
--   • flip net30_enabled on their own company and place $0 net30 orders
--   • create $0 confirmed orders (or self-approve quotes for $0)
--   • mass-update unit_price on subscriptions
--
-- This migration removes the broad write policies. Server Actions in
-- apps/web/app/actions/{subscriptions,quotes,checkout,net30-checkout,
-- team}.ts already use the service-role client for every write, so this
-- change is transparent to the legitimate code paths.
--
-- The orders INSERT policy is replaced (not dropped) with a stricter
-- `WITH CHECK` that pins `status = 'pending'` AND `payment_method = 'card'`,
-- which matches the only RLS-bound caller (Cell 3.3 startCheckout).
--
-- The order_items INSERT policy is intentionally left untouched in this
-- migration; the residual unit_price tampering risk is covered by the
-- next plan step (server-derived pricing).
-- =============================================================

-- ── companies: drop the broad UPDATE policy ───────────────────
-- No application code uses an RLS-bound UPDATE on companies.
-- `getOrCreateStripeCustomer` (apps/web/lib/stripe/customer.ts) writes
-- via the service-role client.
drop policy if exists "users can update their own company" on public.companies;

-- ── subscriptions: replace `for all` with SELECT-only ─────────
-- All writes go through Server Actions using createAdminClient().
drop policy if exists "users can manage their company's subscriptions" on public.subscriptions;

create policy "users can read their company's subscriptions (managed)"
  on public.subscriptions for select
  to authenticated
  using (company_id = public.current_company_id());

-- The legacy SELECT policy is now redundant; drop it after creating the
-- replacement so PostgREST still has a SELECT match throughout.
drop policy if exists "users can read their company's subscriptions" on public.subscriptions;

-- ── quotes: replace `for all` with SELECT-only ────────────────
-- Buyer-side SELECT keeps working (RLS-bound reads in
-- app/(dashboard)/quotes/[id]/page.tsx). All mutations go through the
-- admin client in app/actions/quotes.ts.
drop policy if exists "users can manage their company's quotes" on public.quotes;

create policy "users can read their company's quotes (managed)"
  on public.quotes for select
  to authenticated
  using (company_id = public.current_company_id());

drop policy if exists "users can read their company's quotes" on public.quotes;

-- ── orders: tighten the INSERT policy ─────────────────────────
-- Buyers may only insert pending card orders for their own company.
-- All other status / payment_method combinations must come through a
-- Server Action that uses the service-role client (net30-checkout.ts,
-- approveQuote, the Stripe webhook, etc.).
drop policy if exists "users can insert orders for their company" on public.orders;

create policy "buyers insert pending card orders for their company"
  on public.orders for insert
  to authenticated
  with check (
    company_id = public.current_company_id()
    and status = 'pending'
    and payment_method = 'card'
  );

-- ── order_items: leave as-is (next plan step handles pricing) ─
-- The existing INSERT policy ensures the parent order belongs to the
-- caller's company. Direct unit_price tampering is mitigated by the
-- planned server-derived pricing change; this migration does not
-- attempt to enforce that at the RLS layer.
