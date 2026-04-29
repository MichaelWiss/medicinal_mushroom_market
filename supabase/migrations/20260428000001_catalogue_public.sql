-- =============================================================
-- 20260428000001_catalogue_public.sql
-- Cell 2.4 — Catalog Page (ISR + Realtime).
--
-- 1. Open species + passing batches to anonymous visitors so the
--    storefront landing page renders without sign-in (matches the demo).
-- 2. Add public.batches to the supabase_realtime publication so the
--    catalogue can subscribe to live `available_units` changes.
--
-- All other policies remain unchanged — RLS still gates orders,
-- subscriptions, quotes, companies, and company_users.
-- =============================================================

-- ── species: open SELECT to anon ──────────────────────────────
drop policy if exists "species are readable by authenticated users" on species;

create policy "species are readable by anyone"
  on species for select
  to anon, authenticated
  using (true);

-- ── batches: passing batches readable by anon ─────────────────
drop policy if exists "passing batches are readable by authenticated users" on batches;

create policy "passing batches are readable by anyone"
  on batches for select
  to anon, authenticated
  using (contamination_check = 'pass');

-- ── Realtime: publish batches changes ─────────────────────────
-- The supabase_realtime publication is created by Supabase on init.
-- Adding the table opts batches into INSERT/UPDATE/DELETE broadcasts so
-- the storefront can react to available_units changes without polling.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    -- Drop first to make this migration idempotent across reruns.
    begin
      alter publication supabase_realtime drop table public.batches;
    exception when undefined_object then
      -- table not in publication yet; ignore
      null;
    end;
    alter publication supabase_realtime add table public.batches;
  end if;
end $$;
