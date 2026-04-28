# Mycelium B2B — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       EXTERNAL INTEGRATIONS                              │
│                                                                          │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐              │
│  │  Stripe  │   │  Shippo  │   │  Resend  │   │ PostHog  │              │
│  │ Checkout │   │ Labels + │   │  Email   │   │Analytics │              │
│  │+ webhooks│   │ tracking │   │ (3k/mo)  │   │ (1M/mo)  │              │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘              │
│       │              │              │              │                     │
└───────┼──────────────┼──────────────┼──────────────┼─────────────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          APPS LAYER                                      │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    apps/web  (Next.js 15)                          │   │
│  │                Vercel Hobby — single application                   │   │
│  │                                                                    │   │
│  │   Route group              Purpose                                 │   │
│  │   (storefront)/            Public-ish catalog, species detail     │   │
│  │   (dashboard)/             Buyer: orders, subs, batches, account  │   │
│  │   (admin)/                 Production: batches, CoA, contamination│   │
│  │   /api/webhooks/*          Stripe, Shippo                         │   │
│  │   /auth/callback           Supabase magic-link callback           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
              │                                │
              ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       PACKAGES LAYER                                     │
│                                                                          │
│  ┌────────────────────────┐   ┌────────────────────────────────────┐    │
│  │     @repo/shared       │   │        @repo/db                    │    │
│  │                        │   │                                    │    │
│  │  Domain types          │   │  Supabase migrations               │    │
│  │  Zod schemas           │   │  Generated TS types from DB        │    │
│  │  Pricing engine        │   │  Seed data (species + batches)     │    │
│  │   tier + volume        │   │  RLS policies + JWT claim hook     │    │
│  │   capped 35%           │   │  allocate_batch() PL/pgSQL func    │    │
│  │  Freshness helpers     │   │  moddatetime triggers              │    │
│  │  State-machine guards  │   │                                    │    │
│  └────────────────────────┘   └────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
              │                                │
              ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  SUPABASE (Backend-as-a-Service)                         │
│                                                                          │
│  ┌──────────────────────── Postgres + RLS ──────────────────────────┐   │
│  │  ── Catalog ──────────────────────────────────────────────────   │   │
│  │  species         common/latin name, substrate, shelf_life,        │   │
│  │                  dispatch_window text[], cold_chain_required      │   │
│  │  batches         species_id, inoculation_date, substrate_lot,     │   │
│  │                  contamination_check, available_units,            │   │
│  │                  storage_zone, coa_url, harvest_date, yield_kg    │   │
│  │                                                                   │   │
│  │  ── Companies & Pricing ──────────────────────────────────────   │   │
│  │  companies       name, tier (spot/agreement/oem), net30_enabled,  │   │
│  │                  shipping_address jsonb, stripe_customer_id       │   │
│  │  company_users   company_id, user_id, role (buyer/admin)          │   │
│  │                                                                   │   │
│  │  ── Orders ──────────────────────────────────────────────────    │   │
│  │  orders          status, payment_method, dispatch_date,           │   │
│  │                  tracking_number, total_price, subscription_id    │   │
│  │  order_items     order_id, species_id, batch_id (nullable until   │   │
│  │                  allocated), format, quantity, unit_price         │   │
│  │  subscriptions   species_id, format, quantity, frequency,         │   │
│  │                  priority_tier, next_dispatch, stripe_sub_id      │   │
│  │  quotes          line_items jsonb, status, expires_at             │   │
│  │                                                                   │   │
│  │  RLS:                                                             │   │
│  │   - species, batches(pass) → public to authenticated              │   │
│  │   - companies, orders, subs, quotes → scoped via                  │   │
│  │     auth.jwt() ->> 'company_id' (custom claim, not subquery)      │   │
│  │   - admin role bypasses via service-role key only                 │   │
│  │                                                                   │   │
│  │  Functions:                                                       │   │
│  │   allocate_batch(species_id, qty)  Race-safe FIFO allocation     │   │
│  │   net30_guard()                    Trigger enforcing net-30       │   │
│  │   handle_jwt()                     Auth hook injecting claim      │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────── Realtime (WebSocket) ────────────────────────────┐   │
│  │  Channels:                                                        │   │
│  │   order-status      orders INSERT/UPDATE                          │   │
│  │   batch-stock       batches UPDATE (available_units)              │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────── Auth (Magic link + invite) ──────────────────────┐   │
│  │  Magic-link email. company_users links auth.users → company.     │   │
│  │  Invite-only: company admin emails invite, signup attaches user. │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────── Storage ─────────────────────────────────────────┐   │
│  │  bucket: coa/                                                     │   │
│  │  Signed URLs gated by RLS — buyer must own an order containing   │   │
│  │  an item linked to that batch.                                    │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────── Edge Functions + pg_cron ────────────────────────┐   │
│  │  subscription-engine   pg_cron: 0 6 * * MON                      │   │
│  │                        priority-ordered allocation, backorder    │   │
│  │                        emails via Resend                         │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Buyer-Initiated Flows

```
  Catalog browse:
  ┌─────────┐   ┌──────────┐    ISR 5min    ┌──────────────┐
  │ Browser │──▶│ apps/web │ ─────────────▶│  Supabase    │
  │         │   │  (RSC)   │  + Realtime    │  species +   │
  └─────────┘   └──────────┘    overlay     │  batches     │
                                            └──────────────┘

  Checkout:
  ┌─────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────────┐
  │ Browser │──▶│ Server   │──▶│ Validate     │──▶│ Stripe       │
  │  cart   │   │ Action   │   │ stock +      │   │ Checkout     │
  └─────────┘   └──────────┘   │ dispatch win │   │ Session      │
                               └──────┬───────┘   └──────┬───────┘
                                      │ insert            │ payment
                                      ▼ pending order     ▼ succeeded
                               ┌──────────────┐    ┌──────────────┐
                               │  orders      │◀───│ /api/webhook │
                               │  (pending)   │    │  /stripe     │
                               └──────────────┘    └──────┬───────┘
                                                          │
                                                          ▼
                                              ┌──────────────────┐
                                              │ allocate_batch() │
                                              │ per line item    │
                                              │ → confirmed      │
                                              └──────────────────┘
```

### Scheduled Flows

```
  Monday 06:00 UTC (subscription engine):
  ┌─────────────┐   ┌──────────────────────┐   ┌──────────────┐
  │  pg_cron    │──▶│ subscription-engine   │──▶│ orders       │
  │             │   │  (Edge Function)      │   │ created in   │
  └─────────────┘   │  priority order       │   │ priority     │
                    │  allocate_batch()     │   │ order        │
                    └──────────┬───────────┘   └──────────────┘
                               │ no batch?
                               ▼
                       ┌────────────┐
                       │  Resend    │ backorder email
                       └────────────┘

  On Stripe event:
  ┌──────────┐   ┌──────────────────┐   ┌──────────────────┐
  │  Stripe  │──▶│ /api/webhooks/   │──▶│ allocate_batch + │
  │ webhook  │   │   stripe         │   │ orders.confirmed │
  └──────────┘   └──────────────────┘   └──────────────────┘

  On Shippo event:
  ┌──────────┐   ┌──────────────────┐   ┌──────────────────┐
  │  Shippo  │──▶│ /api/webhooks/   │──▶│ orders.tracking  │
  │ webhook  │   │   shippo         │   │ + status update  │
  └──────────┘   └──────────────────┘   └──────────────────┘
```

---

## State Machines

```
  ORDER STATUS

  pending ──▶ confirmed ──▶ picking ──▶ dispatched ──▶ delivered
     │             │             │
     └─────────────┴─────────────┴──────▶ cancelled


  BATCH CONTAMINATION CHECK

  pending ──▶ pass ──▶ (allocatable)
     │
     └──▶ fail ──▶ (permanently excluded)
```

State transitions are guarded in `packages/shared/state.ts`:
`canTransitionOrder(current, target)` returns `boolean`. The Stripe webhook,
the subscription engine, and the admin UI all call the guard before mutating.

---

## Race-Safe Batch Allocation

The single most important correctness invariant: **two concurrent orders for
the same batch must never over-allocate.**

```sql
CREATE FUNCTION allocate_batch(p_species_id uuid, p_qty int)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_batch_id uuid;
BEGIN
  UPDATE batches
     SET available_units = available_units - p_qty
   WHERE id = (
     SELECT id FROM batches
      WHERE species_id = p_species_id
        AND contamination_check = 'pass'
        AND available_units >= p_qty
      ORDER BY harvest_date ASC NULLS LAST, inoculation_date ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING id INTO v_batch_id;
  RETURN v_batch_id; -- null if no batch could fulfill
END $$;
```

`FOR UPDATE SKIP LOCKED` ensures concurrent callers each pick a different
row. The `WHERE available_units >= p_qty` re-check inside the `UPDATE`
guarantees we never go negative. Callers that get `null` either fall back to
the next-best species batch or trigger a backorder email.

This is verified by a Vitest test that fires 50 concurrent allocations
against a 10-unit batch and asserts exactly 10 succeed.

---

## Pricing Model

```
  List price (basePrice)
       │
       ├── Tier discount
       │     spot       0 %
       │     agreement 10 %
       │     oem       22 %
       │
       ├── Volume break (stacks; configurable per company)
       │     qty ≥  10  → +2 %
       │     qty ≥  50  → +5 %
       │     qty ≥ 100  → +8 %
       │
       ▼
  totalDiscount = min(tierDiscount + volumeBreak, 0.35)   // 35% floor
  unit_price    = round(basePrice × (1 − totalDiscount), 2)
  line_total    = unit_price × quantity
```

Implemented in `packages/shared/pricing.ts` — pure functions, fully unit-tested.

---

## Directory Structure

```
medicinal_mushroom_market/
├── ARCHITECTURE.md             This file
├── BUILD_PLAN.md               Cellular build plan
├── TESTING.md                  Testing strategy
├── Project.md                  Project context & decisions
├── README.md                   Public-facing readme
├── package.json                Root workspace (pnpm + Turborepo)
├── pnpm-workspace.yaml         Workspace roots: apps/*, packages/*
├── turbo.json                  Task pipeline
├── tsconfig.base.json          ES2022, strict, bundler resolution
├── .env.example                Required env vars template
│
├── apps/
│   └── web/                    Next.js 15 storefront + dashboard + admin
│       ├── app/
│       │   ├── (storefront)/   Catalog, species detail, cart
│       │   ├── (dashboard)/    Orders, subscriptions, batch traceability
│       │   ├── (admin)/        Production: batches, CoA, contam workflow
│       │   ├── api/
│       │   │   └── webhooks/   stripe, shippo
│       │   └── auth/callback/  Supabase magic-link callback
│       ├── components/
│       └── lib/                Supabase clients, Stripe, Shippo wrappers
│
├── packages/
│   ├── shared/                 @repo/shared
│   │   └── src/
│   │       ├── types.ts        Domain interfaces
│   │       ├── schemas.ts      Zod (cart, quote line items, webhooks)
│   │       ├── pricing.ts      Tier + volume discount engine
│   │       ├── freshness.ts    Days-since-inoculation, shelf-life remaining
│   │       └── state.ts        canTransitionOrder, etc.
│   └── db/                     @repo/db
│       ├── migrations/
│       │   ├── 0001_initial.sql        8 tables, enums, RLS, JWT hook
│       │   ├── 0002_allocate_batch.sql Race-safe allocation function
│       │   └── 0003_net30_trigger.sql  Net-30 guard
│       ├── seed.sql            ~12 species, ~30 batches
│       └── types.ts            Generated from supabase gen types
│
└── supabase/
    ├── config.toml             Local stack + cron schedules
    └── functions/
        └── subscription-engine/  Monday 06:00 UTC cron
```

---

## Security

- **Authentication**: Supabase Auth, magic-link only. No passwords.
- **Authorization**: RLS on every table. JWT custom claim `company_id`
  injected by Supabase Auth hook; policies use `auth.jwt() ->> 'company_id'`
  for O(1) lookup instead of subquery.
- **Service role key**: Server-side only. Never imported by any file under
  `app/(storefront)/` or `app/(dashboard)/`. ESLint rule enforces this.
- **Webhook verification**: Stripe and Shippo webhook signatures verified
  before any DB write. Invalid signature → 401, no state change.
- **CoA access**: Supabase Storage signed URLs, regenerated per request,
  10-minute expiry. RLS check confirms the requesting user's company has an
  order containing an item with that `batch_id`.
- **Net-30 enforcement**: DB trigger, not application logic. Cannot be
  bypassed by a malicious client even with a valid JWT.
- **Rate limiting**: Vercel Edge middleware on `/api/webhooks/*` and
  Server Actions for cart/checkout. 10 req/min per IP for unauthenticated;
  60 req/min per user for authenticated.
- **Secret handling**: All secrets via Vercel + Supabase env vars; never
  committed. `.env.example` lists names only.

---

## Scalability & Performance

- **Catalog page**: ISR with 5-minute revalidation. Live unit counts via
  Supabase Realtime subscription on `batches`. The static page costs zero
  DB queries on the hot path.
- **Indexes**:
  - `batches (species_id, contamination_check, available_units) WHERE contamination_check = 'pass' AND available_units > 0` — partial index, the only one allocation reads.
  - `subscriptions (next_dispatch, priority_tier) WHERE active = true` — Monday cron path.
  - `orders (company_id, status, placed_at DESC)` — dashboard order list.
  - `order_items (batch_id) WHERE batch_id IS NULL` — unallocated diagnostics.
- **Allocation contention**: `FOR UPDATE SKIP LOCKED` lets concurrent
  allocations make progress against different batches simultaneously.
- **Cold-start mitigation**: Vercel keeps Next.js routes warm via background
  revalidation; Supabase Edge Functions are cold-start ~150ms.
- **Free-tier headroom**: Supabase Free can handle ~10k orders before DB
  size becomes a concern. Path to $25/mo Pro tier is one-click.

---

## Deployment

```
Developer machine                  Production
  pnpm dev                           Vercel ◀── apps/web
  supabase start                     Supabase Free ◀── DB, Auth, Realtime,
  stripe listen --forward-to ...                         Storage, pg_cron,
                                                         Edge Functions
                                     Stripe ◀──── webhooks
                                     Shippo ◀──── webhooks
```

- **apps/web**: Vercel Hobby. Push to `main` → automatic deploy.
- **Supabase**: Free project. Migrations applied via `supabase db push` from
  CI on `main`.
- **Cron**: `pg_cron` schedule defined in `supabase/config.toml` and synced
  on `supabase functions deploy`.
- **Secrets**: Vercel env vars (production) + Supabase project env (Edge
  Functions). `.env.local` for dev.

---

## Monitoring & Observability

- **Logs**: Vercel function logs + Supabase Edge Function logs. Filter by
  request ID across both via a `x-request-id` header set in middleware.
- **Errors**: Sentry (free tier) on browser, server actions, edge functions.
- **Metrics**: PostHog dashboards for funnels (catalog → cart → checkout),
  batch allocation success rate, subscription dispatch outcomes.
- **Alerting**: Resend email on backorder; Sentry email on uncaught error;
  Supabase usage email at 80% of free-tier limits.
- **Health check**: `/api/health` returns DB ping + last successful cron run
  timestamp.

---

## Future Considerations

- Add Typesense if catalog grows past ~100 species (Postgres FTS becomes
  slow on facet-heavy filters).
- Add ERPNext (or self-hosted Odoo) when production ops need supplier POs,
  BOMs, or multi-warehouse — not before.
- Add Medusa.js if commerce features (complex carts, B2B-specific checkout
  UX, marketplace functions) outgrow custom Next.js + Stripe.
- IoT cold-chain temperature logging for in-transit shipments — buyer
  request driven, not built speculatively.
- Auto-CoA generation from batch data + LIMS integration.
- Public read-only API for buyers' procurement systems to query stock and
  place orders programmatically (with API-key auth).
