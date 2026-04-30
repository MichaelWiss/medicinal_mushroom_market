-- =============================================================
-- 20260501000002_subscription_engine_cron.sql
-- Cell 4.3 — Schedule the `subscription-engine` Edge Function via
-- pg_cron + pg_net.
--
-- Cron expression: `0 6 * * MON`  (every Monday at 06:00 UTC).
--
-- The cron job posts to the function URL with the service-role key
-- as the bearer token. Both the URL and the key are read from
-- per-environment GUCs (`app.settings.supabase_url`,
-- `app.settings.service_role_key`) so the same migration is safe to
-- apply locally and in hosted Supabase.
--
-- Operators must `ALTER DATABASE postgres SET app.settings.* = '...';`
-- (or set the values via the Supabase Dashboard → SQL editor) for
-- the job to actually fire. When unset, the call returns NULL and
-- pg_cron logs the no-op without raising.
-- =============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Drop any prior schedule with the same name so re-running this
-- migration does not pile up duplicate jobs.
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
        'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
      ),
      body    := '{}'::jsonb
    );
  $cron$
);
