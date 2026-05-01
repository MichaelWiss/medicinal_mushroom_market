-- =============================================================
-- 20260501000003_system_metrics.sql
-- Cell 7.4 — system_metrics table for health check + cron monitoring.
--
-- Stores key/value pairs written by internal services (subscription
-- engine, future cron jobs) so the /api/health endpoint can surface
-- operational state without a manual SQL look-up.
--
-- Access:
--   • Written by service-role clients (Edge Functions, admin routes).
--   • Read by the /api/health route handler (admin client).
--   • No access for authenticated or anon roles (RLS blocks both;
--     service-role bypasses RLS as usual).
-- =============================================================

create table if not exists public.system_metrics (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);

alter table public.system_metrics enable row level security;

-- Seed the row so /api/health always has a record to read
-- (value null sentinel is represented as the empty string here; the
-- app treats a missing row the same as null).
insert into public.system_metrics (key, value, updated_at)
values ('last_cron_run', '', now())
on conflict (key) do nothing;
