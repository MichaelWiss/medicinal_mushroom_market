# Security

Living document. Tracks the threats audited, the fixes applied, and the
operator checklist to ship the project safely. Pair with the brief
overview in `ARCHITECTURE.md#security` for the high-level model.

## Audit summary

A full read-only audit of the project (Next.js 15 + Supabase + Stripe +
Shippo + Resend + Upstash) produced nine findings, severity ordered.
All are addressed in code; the residual operator work is consolidated
under [Deploy checklist](#deploy-checklist).

| # | Severity | Area | Status |
|---|----------|------|--------|
| 1 | High | Open Supabase self-signup (`enable_signup = true`) | Fixed |
| 2 | Critical | `actions/dispatches.ts` had no auth — anyone could publish posts | Fixed |
| 3 | High | `/console` and ops actions only required "any session" | Fixed |
| 4 | High | RLS write policies allowed direct DB tampering (orders, subscriptions, quotes, companies) | Fixed |
| 5 | High | Checkout actions trusted client-supplied `unitPrice` / `speciesName` | Fixed |
| 6 | Medium | Subscription-engine bearer compared with `!==`; defaulted to service-role key | Fixed |
| 7 | Moderate | `pnpm audit` advisories: `postcss@8.4.31`, `uuid@10.0.0` | Fixed |
| 8 | Medium | Magic-link / checkout / invite origins derived from `Host` headers | Fixed |
| 9 | Low | No security headers, in-memory rate-limit fallback usable in production | Fixed |

## What was changed

### 1. Disable open self-signup (`supabase/config.toml`)
- `[auth].enable_signup = false`, `[auth.email].enable_signup = false`.
- Buyers are created exclusively via the admin invite flow
  (`auth.admin.inviteUserByEmail`), which uses the service role and
  bypasses the flag. Magic-link sign-in for previously invited users is
  unaffected.

### 2. Authenticate `apps/web/app/actions/dispatches.ts`
- Every Server Action (`createPost`, `updatePost`, `publishPost`,
  `unpublishPost`, `deletePost`) now calls `requireOps()` before
  touching the admin client. Prior to this fix the actions had no auth
  guard at all.

### 3. Real ops-role gating
- New table `public.ops_users(user_id, created_at)` defined in
  `supabase/migrations/20260504000001_ops_users.sql`. RLS enabled; no
  policies for authenticated/anon — only the service-role client can
  read or write the allow-list.
- Seed (`supabase/seed.sql`) adds `admin@craftbrew.test` to
  `ops_users` so dev `/console` access keeps working out of the box.
- Helper `apps/web/lib/auth/require-ops.ts` (`requireOps`) checks the
  session and the allow-list via the service-role client; fails closed
  on read errors.
- Centralised gate at `apps/web/app/(admin)/layout.tsx` redirects
  unauthorised callers to `/sign-in?next=/console`.
- `apps/web/app/actions/{dispatch,batches,dispatches}.ts` now route
  their `requireSignedInOps` helper through `requireOps`.

### 4. RLS write tightening (`20260504000002_rls_tighten.sql`)
- Drops `companies` "users can update their own company" policy. No
  RLS-bound writer existed; admin client handles `getOrCreateStripeCustomer`.
- Replaces `subscriptions` `for all` with SELECT-only. Writes go
  through `actions/subscriptions.ts` using the admin client.
- Replaces `quotes` `for all` with SELECT-only. Writes go through
  `actions/quotes.ts` using the admin client.
- Tightens the `orders` INSERT policy to require
  `status = 'pending' AND payment_method = 'card'`. The only RLS-bound
  inserter is `startCheckout`, which already inserts those values.

### 5. Server-derived pricing
- New helper `apps/web/lib/checkout/pricing.ts` (`resolveTrustedLine`)
  re-derives the per-unit price (in pence) and species name from the
  trusted `PRESENTATION_BY_LATIN` map and the DB `species` row. The
  helper has no surface for the client to inject a price.
- `apps/web/app/actions/checkout.ts` and
  `apps/web/app/actions/net30-checkout.ts` now drop the client-supplied
  `unitPrice` / `speciesName` after Zod validation and use trusted
  values for Stripe `unit_amount`, `total_price`, and `order_items.unit_price`.
- Coverage: `apps/web/lib/checkout/__tests__/pricing.test.ts` (6 unit
  tests) and
  `apps/web/app/actions/__tests__/checkout.tampered-pricing.test.ts`
  (2 integration tests) lock in the property by submitting a tampered
  cart and asserting Stripe + DB receive the trusted values.

### 6. Subscription-engine secret hardening
- `supabase/functions/subscription-engine/index.ts` adds
  `timingSafeEqualString` (length-checked XOR loop) and replaces
  `auth !== expected` with the constant-time compare. The
  `SUBSCRIPTION_ENGINE_SECRET` env var is now mandatory; missing
  configuration returns `503 "Engine secret not configured"` instead
  of silently falling back to the service-role key.
- New migration
  `supabase/migrations/20260504000003_subscription_engine_cron_secret.sql`
  reschedules the weekly cron to read the bearer from
  `app.settings.subscription_engine_secret` instead of
  `app.settings.service_role_key`. Operators set both the GUC and the
  function env var to identical random values.

### 7. Dependency advisories
- Root `package.json` adds `pnpm.overrides`:
  - `postcss: "^8.5.10"` (closes GHSA-qx2v-qp2m-jg93).
  - `uuid: "^14.0.0"` (closes GHSA-w5hq-g745-h8pq via `resend > svix`).
- `pnpm audit` reports 0 advisories at every severity (prod and dev).

### 8. Origin lock-down
- New helper `apps/web/lib/auth/origin.ts` (`resolveSiteOrigin`,
  `UntrustedOriginError`).
  - In production, requires `NEXT_PUBLIC_SITE_URL`; throws otherwise.
  - In dev/test, falls back to a small allow-list (`localhost`,
    `127.0.0.1`, plus comma-separated entries in
    `NEXT_PUBLIC_DEV_ORIGIN_ALLOWLIST`).
- Wired into:
  - `apps/web/app/auth/callback/route.ts`
  - `apps/web/app/api/invites/route.ts`
  - `apps/web/app/actions/checkout.ts`
  - `apps/web/app/(dashboard)/team/page.tsx`

### 9. Production hardening
- `apps/web/next.config.mjs` ships per-route security headers:
  Strict-Transport-Security (2y, preload), X-Content-Type-Options,
  Referrer-Policy (`strict-origin-when-cross-origin`),
  Permissions-Policy (deny camera/mic/geo/topics; allow Stripe payment
  origins), X-Frame-Options DENY, plus a permissive **Report-Only** CSP
  whose origins (Supabase, Sentry, PostHog, Stripe) are derived from
  env vars.
- `apps/web/lib/rate-limit/limiter.ts` now throws when
  `NODE_ENV === 'production'` and the Upstash credentials are missing.
  The in-memory fallback is restricted to dev/test.
- `supabase/config.toml` carries an in-place comment listing the four
  flags to flip when you eventually create a hosted Supabase project
  (`enable_confirmations`, `secure_password_change`,
  `minimum_password_length`, `password_requirements`).

## Validation

Every change has a corresponding automated check. Re-run any time:

```bash path=null start=null
pnpm typecheck                                           # 3/3 packages green
pnpm lint                                                # clean
pnpm --filter web test                                   # 8/8 (pricing + checkout integration)
pnpm --filter @repo/shared test                          # 50/50 (pricing engine + freshness)
SUPABASE_SECRET_KEY=$(supabase status -o env | awk -F'=' '/^SERVICE_ROLE_KEY=/{gsub(/"/,"",$2); print $2}') \
  pnpm --filter @repo/db test                            # 2/2 (allocate_batch concurrency)
pnpm audit                                               # 0 advisories
```

## Deploy checklist

The work above closes the source-side risks. The remaining hardening
is environmental; do not deploy without ticking every item below.

### Env vars — required in production

| Variable | Where | Why |
|----------|-------|-----|
| `NEXT_PUBLIC_SITE_URL` | Vercel (or equivalent) | Origin resolver throws when unset in production. Magic-link redirects, Stripe success/cancel URLs, invite emails, and team-invite UI all depend on it. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Standard Supabase wiring. Service role is server-only and ESLint-guarded. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Vercel | Checkout + webhook signature verification. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Vercel | Transactional email. Without these, sends become console-logged no-ops. |
| `SHIPPO_API_KEY`, `SHIPPO_WEBHOOK_SECRET` | Vercel | Label generation + webhook HMAC verification. |
| `WAREHOUSE_*` | Vercel | Required before any label can be generated. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Vercel | Required in production. Step 9 makes the rate limiter fail closed otherwise. |
| `SUBSCRIPTION_ENGINE_SECRET` | Supabase function env | Bearer expected by the cron-triggered subscription engine. Generate a fresh random hex value. |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` | Vercel | Browser + server error reporting. Optional but recommended. |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `POSTHOG_KEY` | Vercel | Analytics. Optional. |

### Postgres GUCs — set on the hosted DB

Run these once after creating the hosted Supabase project:

```sql path=null start=null
alter database postgres set app.settings.supabase_url = 'https://<project-ref>.supabase.co';
alter database postgres set app.settings.subscription_engine_secret = '<same-random-hex-as-the-function-env-var>';
```

The cron job in `20260504000003_subscription_engine_cron_secret.sql`
reads both. When unset, the cron call sends an empty bearer and the
Edge Function returns 401 — the desired loud-failure mode.

### Hosted Supabase auth settings

Flip the following in the Supabase dashboard (Auth → Sign in / Providers,
or via `supabase config push` after `supabase login`):

- `enable_signup` = false (global and email)
- `enable_confirmations` = true
- `secure_password_change` = true
- `minimum_password_length` ≥ 12
- `password_requirements` = `lower_upper_letters_digits_symbols`

The local `supabase/config.toml` keeps the seed-friendly defaults so
`supabase db reset` in dev is unaffected.

### Push migrations

```bash path=null start=null
supabase login
supabase link --project-ref <your-project-ref>
supabase config push        # syncs [auth] / [auth.email] / etc. from config.toml
supabase db push            # applies all migrations including the step-3/4/6 ones
supabase functions deploy subscription-engine
supabase secrets set SUBSCRIPTION_ENGINE_SECRET=<same-hex-as-the-GUC>
```

### Seed `ops_users`

Once the hosted DB is migrated, insert at least one ops user manually
(the seed.sql is local-only):

```sql path=null start=null
insert into public.ops_users (user_id)
select id from auth.users where email = 'ops@yourdomain.com';
```

Without this row the `/console` layout will redirect everyone — buyers
included — to `/sign-in?next=/console`.

### Switch the CSP from Report-Only to enforce

`apps/web/next.config.mjs` ships
`Content-Security-Policy-Report-Only` so a missed origin shows up in the
browser console without breaking pages. After your first production
day with no console reports, rename the header to
`Content-Security-Policy` and redeploy.

### Post-deploy smoke checks

- Browser console clean of CSP report violations on `/`, `/dispatches`,
  `/sign-in`, `/cart`, `/orders/<id>`, `/console` (logged in as ops).
- `curl -I https://<site>` returns the security headers.
- Hit `https://<project-ref>.supabase.co/functions/v1/subscription-engine`
  with no bearer; expect `401`.
- Hit `/api/health`; expect `db: 'ok'` and a recent `last_cron_run`
  timestamp after the first Monday cron tick.
- Try a tampered checkout: open dev tools, change one cart item's
  `unitPrice` in localStorage to `1`, proceed to Stripe Checkout — the
  Stripe page must show the catalogue price, not £0.01.

## Operating notes

- Rotating `SUBSCRIPTION_ENGINE_SECRET`: update both the function env
  var and the GUC in the same maintenance window. The two values must
  match for cron-triggered runs to succeed.
- Adding an ops user: insert a row into `public.ops_users`. Removal is
  a `delete` on the same table.
- Reviewing dependency advisories: `pnpm audit` runs cleanly today.
  Add it to CI; expect false positives in transitive dev dependencies
  to be addressed via `pnpm.overrides` in `package.json`.
- New Server Actions that touch admin data must call `requireOps()`
  from `apps/web/lib/auth/require-ops.ts` even though the
  `(admin)/console` layout already gates the UI route — defence in
  depth against direct POSTs to the action endpoint.
- New cart-shaped inputs must go through
  `apps/web/lib/checkout/pricing.ts` (`resolveTrustedLine`); never
  trust client-supplied prices or species names.
