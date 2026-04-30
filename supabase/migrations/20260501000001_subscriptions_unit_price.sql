-- =============================================================
-- 20260501000001_subscriptions_unit_price.sql
-- Cell 4.3 — capture unit price at subscription creation so the
-- `subscription-engine` Edge Function can build order_items
-- without consulting the frontend presentation map.
-- =============================================================

alter table public.subscriptions
  add column if not exists unit_price integer not null default 0
    check (unit_price >= 0);

comment on column public.subscriptions.unit_price is
  'Per-unit list price in pence captured at subscription creation. '
  'Used by subscription-engine to build order_items.unit_price.';
