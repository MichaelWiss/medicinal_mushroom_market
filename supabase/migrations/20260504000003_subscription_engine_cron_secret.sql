-- =============================================================
-- 20260504000003_subscription_engine_cron_secret.sql
-- Subscription-engine secret hardening (security plan step 6).
--
-- The earlier cron migration (20260501000002) sent the database's
-- service-role key as the bearer token to the subscription-engine
-- Edge Function, and the function defaulted ENGINE_SECRET to that
-- same key. That meant:
--
--   • The full service-role key was stored as a Postgres GUC and read
--     on every cron tick (any superuser/postgres-role user could lift
--     it via current_setting).
--   • Code paths that reused ENGINE_SECRET inadvertently got
--     service-role privileges.
--
-- This migration:
--
--   1. Unschedules the old cron job.
--   2. Re-schedules it with the bearer reading from a dedicated GUC,
--      `app.settings.subscription_engine_secret`. The Edge Function
--      now requires `SUBSCRIPTION_ENGINE_SECRET` to be set explicitly
--      (no fallback to the service-role key), so the two values can be
--      rotated independently.
--
-- Operators must set the GUC and the function env var to identical
-- random values:
--
--   ALTER DATABASE postgres
--     SET app.settings.subscription_engine_secret = '<random hex>';
--   supabase secrets set SUBSCRIPTION_ENGINE_SECRET=<same random hex>
--
-- When the GUC is unset, the cron call sends an empty bearer and the
-- function returns 401, which is the desired loud-failure mode.
-- =============================================================

-- Unschedule the old job (idempotent — guarded against missing schedule).
do $$
begin
  perform cron.unschedule('subscription-engine-weekly');
exception
  when others then null;
end $$;

select cron.schedule(
  'subscription-engine-weekly',
  '0 6 * * MON',
  $cron$
    select net.http_post(
      url     := coalesce(current_setting('app.settings.supabase_url', true), '') ||
                 '/functions/v1/subscription-engine',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          coalesce(current_setting('app.settings.subscription_engine_secret', true), '')
      ),
      body    := '{}'::jsonb
    );
  $cron$
);
