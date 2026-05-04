-- =============================================================
-- 20260504000001_ops_users.sql
-- Ops-role gating (security plan step 3).
--
-- Introduces a small allow-list of users who are authorised to use
-- the /console admin surface and the *_AS_OPS Server Actions
-- (apps/web/app/actions/dispatch.ts, batches.ts, dispatches.ts).
--
-- The application checks membership server-side via the service-role
-- client (see apps/web/lib/auth/require-ops.ts). RLS is enabled with
-- no policies so only the service-role client can read/write — the
-- same pattern used by `system_metrics` (20260501000003).
-- =============================================================

create table if not exists public.ops_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ops_users enable row level security;

comment on table public.ops_users is
  'Allow-list of ops/admin users. Membership grants access to /console '
  'and the ops Server Actions. Read/written only via the service-role '
  'client; no RLS policies are defined for authenticated/anon roles.';
