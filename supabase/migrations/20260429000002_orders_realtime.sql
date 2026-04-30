-- =============================================================
-- 20260429000002_orders_realtime.sql
-- Cell 3.5 — Order History + Tracking.
--
-- Add public.orders to the supabase_realtime publication so the
-- dashboard order detail page can subscribe to live status changes
-- (pending → confirmed → picking → dispatched → delivered).
--
-- RLS is unchanged: the existing per-company policies on `orders`
-- mean the broadcast stream is server-side filtered to the caller's
-- own company — a different company's session cannot receive payloads
-- for orders it does not own.
-- =============================================================

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    -- Drop first to make this migration idempotent across reruns.
    begin
      alter publication supabase_realtime drop table public.orders;
    exception when undefined_object then
      -- table not in publication yet; ignore
      null;
    end;
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
