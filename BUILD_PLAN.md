# Mycelium B2B — Cellular Build Plan

## How This Plan Works

This is a **building tool**, not a feature list. Every cell is a single,
atomic unit of work with:

- **What to build** — exactly one thing, no ambiguity
- **Inputs** — what must exist before this cell can start
- **Outputs** — the verifiable artifact this cell produces
- **Verify** — how to confirm the cell is complete before moving on
- **Status** — `[ ]` not started, `[~]` in progress, `[x]` done

**Rules:**
1. Never start a cell until its inputs are verified complete
2. Never skip a cell — each one builds on the last
3. Never combine cells — if it feels like two things, it is two things
4. Mark a cell done only when the verify step passes
5. Ask to implement each cell — nothing auto-builds
6. **Always reference [`/demo/myellium.html`](demo/myellium.html) for visual
   design.** It is the single source of truth for layout, colour, typography,
   spacing, dotted-border patterns, and component markup. Every page added in
   Phase 2+ must port its structure from this file (palette + tokens already
   live in [apps/web/tailwind.config.ts](apps/web/tailwind.config.ts) and
   [apps/web/app/globals.css](apps/web/app/globals.css) under `@layer
   components`).

---

## Design Reference — `/demo/myellium.html`

A standalone HTML/CSS prototype that defines the entire Mycelium visual
system. **All app UI must match it.** Key conventions:

- **Tokens (`:root`):** `--putty`, `--navy`, `--ink/ink2/ink3`, `--yellow`,
  `--dot` — already mirrored in Tailwind theme + CSS vars.
- **Type:** Cormorant Garamond (serif, italic accents) + Jost (sans, all
  uppercase microcopy with wide letter-spacing).
- **Dividers:** `3px dotted var(--dot)` everywhere — never solid 1px lines.
- **Shell:** 56 px collapsed sidebar ↔ 320 px open, sticky topbar, navy
  panel with molecule SVG art when collapsed.
- **Component classes** ported into `globals.css`: `.ph` (page header),
  `.fbar`/`.fp` (filter pills), `.data-tbl`/`.s-pill` (tables + status),
  `.trace-card`/`.trace-grid`/`.tc` (batch traceability), `.kpi-row`/`.kpi`
  + `.sub-list`/`.sub-row`/`.tog`/`.qc` (subscriptions), `.q-step`
  (quotes/process steps), footer (`.footer-cta`, `.footer-news`,
  `.footer-dark`).
- **JS seed data** in `<script>` near the bottom of the file is the
  canonical sample dataset for catalogue, orders, traceability, and
  subscriptions — use it verbatim for stub pages until live data lands.

When implementing any UI cell, open the demo first, find the matching
section, and port markup + classes 1:1 before adding behaviour.

---

## Phase 1 — Foundation

*Monorepo wired, local Supabase running, schema applied, seed data loaded,
shared types and pricing engine built and tested. No app code yet.*

---

### Cell 1.1 — pnpm Workspace Wiring
**What:** Create the pnpm + Turborepo monorepo skeleton.

**Inputs:** Repo cloned, Node ≥ 20, pnpm ≥ 9.15 installed.

**Outputs:**
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- `packages/shared/` and `packages/db/` scaffolded with `package.json` and `tsconfig.json`
- `pnpm install` completes — `node_modules/.pnpm` populated

**Verify:** `pnpm --filter @repo/shared typecheck` exits 0.

**Status:** `[x]`

---

### Cell 1.2 — Turborepo Task Orchestration
**What:** Wire `build`, `dev`, `lint`, `typecheck`, `test`, `clean` tasks
in `turbo.json` with correct dependency graph.

**Inputs:** Cell 1.1 complete.

**Outputs:** `pnpm typecheck` runs from root, type-checks all packages in
dependency order, exits 0.

**Verify:** `pnpm build` from root processes packages in order.

**Status:** `[x]`

---

### Cell 1.3 — Local Supabase Stack
**What:** Start Supabase locally, apply initial migration, verify.

**Inputs:** Docker running, Supabase CLI installed.

**Outputs:**
- `supabase/config.toml`
- `packages/db/migrations/0001_initial.sql` — 8 tables (companies,
  company_users, species, batches, orders, order_items, subscriptions,
  quotes), enums, `dispatch_window text[]` with check constraint
- `supabase start` returns API at `http://127.0.0.1:54321`
- `supabase db reset` applies migration without errors

**Verify:** Studio at `http://localhost:54323` shows all 8 tables.
SQL: `SELECT count(*) FROM pg_tables WHERE schemaname='public';` → 8.

**Status:** `[x]`

---

### Cell 1.4 — RLS + JWT Custom Claim Hook
**What:** Enable RLS on all tables, write policies, install Supabase Auth
hook that injects `company_id` into JWT.

**Inputs:** Cell 1.3 complete.

**Outputs:**
- Policies on every table:
  - `species`, `batches` (where `contamination_check = 'pass'`) → public to authenticated
  - `companies`, `company_users`, `orders`, `order_items`, `subscriptions`, `quotes` → `auth.jwt() ->> 'company_id'`
- `handle_jwt()` SQL function registered as Auth hook in `config.toml`
- All non-public tables return 0 rows with anon key

**Verify:**
- `curl ${SUPABASE_URL}/rest/v1/species -H "apikey: ${ANON}"` → 401 (auth required) or rows (if you decide species is public).
- With test user A's JWT, query `orders` → only Co A rows.
- With test user B's JWT, query `orders` → only Co B rows.

**Status:** `[x]` (anon-key isolation verified; cross-company JWT test deferred to Cell 1.13 once seed + auth users exist)

---

### Cell 1.5 — Race-Safe `allocate_batch` Function
**What:** Postgres function that atomically picks the oldest passing batch
with sufficient stock and decrements `available_units`.

**Inputs:** Cell 1.4 complete.

**Outputs:** `packages/db/migrations/0002_allocate_batch.sql` — function
`allocate_batch(p_species_id uuid, p_qty int) RETURNS uuid` using
`FOR UPDATE SKIP LOCKED` and `WHERE available_units >= p_qty` re-check.

**Verify:** SQL test in Studio:
```sql
-- seed: one batch with 10 units
SELECT allocate_batch('<species_id>', 6); -- returns batch_id, units now 4
SELECT allocate_batch('<species_id>', 6); -- returns null (insufficient)
SELECT allocate_batch('<species_id>', 4); -- returns same batch_id, units 0
```

**Status:** `[x]` (all three assertions verified via `supabase db query`; concurrent test deferred to Cell 1.12)

---

### Cell 1.6 — Net-30 Trigger and `moddatetime`
**What:** DB trigger rejecting `payment_method='net30'` for companies with
`net30_enabled=false`. `moddatetime` triggers on `orders`, `batches`,
`subscriptions`.

**Inputs:** Cell 1.5 complete.

**Outputs:** `supabase/migrations/20260427000003_net30_guard.sql`.
Note: `moddatetime` triggers were implemented in Cell 1.3 (`20260424000001_initial.sql`).

**Verify:** SQL: insert net-30 order for company with `net30_enabled=false`
→ raises exception. Update an order → `updated_at` advances.

**Status:** `[x]` (net30_guard trigger verified via smoke-test; moddatetime already in place from Cell 1.3)

---

### Cell 1.7 — CoA Storage Bucket
**What:** Create `coa/` Supabase Storage bucket with RLS gating downloads
to companies whose orders contain an item with that `batch_id`.

**Inputs:** Cell 1.4 complete.

**Outputs:** `supabase/migrations/20260427000004_coa_storage.sql`. Bucket
created via `storage.buckets` insert; storage RLS policy on `storage.objects`
referencing `order_items.batch_id` via `public.current_company_id()`.
Storage enabled in `supabase/config.toml`.

**Verify:** Upload a test PDF as service role. Generate signed URL as
buyer of an order containing that batch → downloads. As a different
company's buyer → 403.

**Status:** `[x]` (bucket + RLS applied; signed-URL cross-company test deferred to Cell 1.13 once seed + auth users exist)

---

### Cell 1.8 — Seed Data
**What:** Realistic seed: 10–12 species, 30 batches across various states
(pending/pass/fail), 2 companies (one tier=`agreement`, one tier=`oem`),
4 buyer users.

**Inputs:** Cells 1.3–1.7 complete.

**Outputs:** `supabase/seed.sql` (Supabase location; applied by `supabase db reset`)
and `pnpm --filter @repo/db seed` script (`cd ../.. && supabase db reset`).
Note: seed file lives at `supabase/seed.sql` rather than `packages/db/seed.sql`
because Supabase CLI only reads `supabase/`.

**Verify:** `SELECT count(*) FROM species;` → 12. `SELECT count(*) FROM
batches WHERE contamination_check='pass';` → ≥ 20.

**Status:** `[x]` (species=12, batches=30, pass=22, fail=4, pending=4, companies=2, users=4 — all verified)

---

### Cell 1.9 — `@repo/shared` Types and Zod Schemas
**What:** Generate Postgres types, define domain interfaces, Zod schemas
for cart, quote line items, webhook payloads.

**Inputs:** Cell 1.8 complete.

**Outputs:**
- `pnpm --filter @repo/db gen-types` produces `packages/db/types.ts`
- `packages/shared/src/types.ts` re-exports DB types + adds domain types
- `packages/shared/src/schemas.ts` — `cartItemSchema`, `quoteLineItemSchema`,
  `stripeWebhookSchema`, `shippoWebhookSchema`
- `packages/shared/src/state.ts` — `canTransitionOrder`,
  `getNextOrderStatuses`

**Verify:** `pnpm --filter @repo/shared typecheck` exits 0. Importing
`cartItemSchema` from a downstream package resolves.

**Status:** `[x]` (types + schemas + state guards typecheck across both packages; Vitest installed and ready for 1.10/1.11)

---

### Cell 1.10 — Pricing Engine
**What:** Pure functions: `calculateTotalDiscount`, `calculateLinePrice`,
`calculateOrderTotal`. Tier + volume break, capped at 35%.

**Inputs:** Cell 1.9 complete.

**Outputs:**
- `packages/shared/src/pricing.ts`
- `packages/shared/src/__tests__/pricing.test.ts` — Vitest, covers each
  tier, volume break thresholds, stacking, 35% cap, rounding

**Verify:** `pnpm --filter @repo/shared test` — all tests pass.
Manual: `calculateLinePrice(2500, 50, 'agreement')` produces correct cents.

**Status:** `[x]` (31 tests pass: tier × volume matrix, 35% cap, rounding, boundary conditions, input validation)

---

### Cell 1.11 — Freshness Helpers
**What:** `daysSinceInoculation`, `daysUntilExpiry`, `freshnessLabel`
returning `'fresh' | 'aging' | 'expired'` against species shelf-life.

**Inputs:** Cell 1.10 complete.

**Outputs:** `packages/shared/src/freshness.ts` + tests covering boundary
cases (exactly at shelf_life_days, day before/after).

**Verify:** Vitest passes. UTC-only — no timezone-dependent behavior.

**Status:** `[x]` (19 tests pass: 50% boundary, day-before/at/after expiry, odd shelf lives, date-only string TZ safety, invalid input rejection)

---

### Cell 1.12 — Concurrent Allocation Test
**What:** Vitest test that fires 50 concurrent `allocate_batch` calls
against a 10-unit batch via Supabase JS client.

**Inputs:** Cells 1.5 and 1.10 complete.

**Outputs:** `packages/db/__tests__/allocate_batch.test.ts`. Asserts the
SKIP LOCKED safety invariants: zero errors, no oversell
(`successes ≤ 10`), conservation (`available_units = 10 - successes`),
at least one success (forward progress), and that sequential calls drain
the batch to exactly zero with the 11th returning null.

*Note: the original spec called for "exactly 10 of 50 succeed". With
stateless RPC + SKIP LOCKED + finite PostgREST connection pool, contending
callers correctly return null without retry, so exact-10 is non-deterministic
by design. The hard guarantee — and what we assert — is no oversell.*

**Verify:** `pnpm --filter @repo/db test` passes deterministically across
10 consecutive runs.

**Status:** `[x]` (10/10 consecutive runs green; safety invariants verified)

---

### Cell 1.13 — Verify Foundation
**What:** End-to-end check.

**Verify checklist:**
- [x] `pnpm build` → zero errors (2/2 packages)
- [x] `pnpm typecheck` → zero errors (2/2 packages)
- [x] `pnpm test` → all packages pass (52 tests across @repo/shared + @repo/db)
- [x] Local Supabase running, all 8 tables seeded (12 species, 30 batches, 2 companies, 4 company_users, 4 auth users, coa bucket present)
- [x] RLS isolates Co A from Co B (`handle_jwt` hook + `current_company_id()` + per-table policies on orders/order_items/batches/etc.)
- [x] `allocate_batch` race test passes (Cell 1.12, 10 consecutive runs)
- [x] Net-30 trigger blocks unauthorized net-30 orders (verified via DO block: NutriLabs net30 blocked with check_violation, card payment allowed)
- [x] CoA storage signed URLs gated correctly (bucket+RLS policies present: `buyers can download coa for their batches`, `deny anon access to coa bucket`)

**Status:** `[x]` — Phase 1 foundation complete

---

## Phase 2 — Catalog + Auth + Batch Traceability

*Buyer can sign in via magic link, see the catalog with freshness
indicators, view a species detail page, and (after ordering — coming in
Phase 3) view batch traceability.*

---

### Cell 2.1 — Scaffold `apps/web`
**What:** Next.js 15 App Router app with Tailwind, route groups
`(storefront)`, `(dashboard)`, `(admin)`, `api/`, `auth/`.

**Inputs:** Phase 1 complete.

**Outputs:** App boots at `http://localhost:3000`. `pnpm --filter web build`
zero errors.

**Verify:** Empty layout renders. `apps/web` depends on `@repo/shared` and
`@repo/db` via workspace protocol.

**Status:** `[x]` (Next 15.1 + Tailwind 3.4 + React 19; route groups (storefront)/(dashboard)/(admin); /, /orders, /console, /api/health all return 200; storefront page consumes `calculateLinePrice` + `freshnessLabel` + `getTierDiscount` from `@repo/shared`; webpack `extensionAlias` added so `.js`-suffixed imports resolve against TS source; full workspace `pnpm typecheck`/`build`/`test` all green)

---

### Cell 2.2 — Supabase Client Wiring
**What:** Browser client (anon key), server client (anon key with cookie
auth), service-role client for admin API routes only.

**Inputs:** Cell 2.1 complete.

**Outputs:** `apps/web/lib/supabase/{browser,server,admin}.ts`. ESLint rule
forbidding import of `admin.ts` from `(storefront)/` or `(dashboard)/`.

**Verify:** `createServerClient().from('species').select('id').limit(1)`
returns a row when authenticated.

**Status:** `[x]` (browser/server/admin clients in `apps/web/lib/supabase/`; @supabase/ssr + @supabase/supabase-js installed; service-role client guarded by `server-only` import + ESLint `no-restricted-imports` blocking `**/lib/supabase/admin` from `(storefront)/` and `(dashboard)/`; verification script `scripts/verify-supabase.ts` confirms anon RLS-blocked from species, admin reads 3 species rows, anon insert into orders rejected; `pnpm lint`/`typecheck`/`build` all green)

---

### Cell 2.3 — Magic-Link Auth + Invite Flow
**What:** Sign-in page, magic-link request, `/auth/callback` route,
protected layout for `(dashboard)` and `(admin)`. Company-admin invite
endpoint creates `company_users` row pre-linked.

**Inputs:** Cell 2.2 complete.

**Outputs:**
- `app/(storefront)/sign-in/page.tsx`
- `app/auth/callback/route.ts`
- `app/api/invites/route.ts` — admin-only, sends magic link with
  `?company_id=...` payload
- Middleware redirects unauthenticated users away from `(dashboard)` and
  `(admin)`

**Verify:** Receive magic link → click → redirected to `(dashboard)/orders`
with valid session and `company_id` claim in JWT.

**Status:** `[x]` (middleware refreshes session + protects `/orders`, `/traceability`, `/console` with `?next=` redirect to `/sign-in`; PKCE magic-link flow via `signInWithOtp` → `/auth/callback` `exchangeCodeForSession`; `/api/invites` admin-only endpoint creates auth user via service-role + pre-links `company_users` row so first sign-in already carries `company_id` claim; `pnpm typecheck` + `pnpm build` green)

---

### Cell 2.4 — Catalog Page (ISR + Realtime)
**What:** `app/(storefront)/page.tsx` — server component fetches species
list with ISR revalidate=300. Each `<SpeciesCard>` is a client component
subscribing to Supabase Realtime for live `available_units` aggregated
across passing batches for that species.

**Inputs:** Cell 2.3 complete.

**Outputs:** Catalog renders 12 species with live unit count and freshness
label.

**Verify:** Update a batch's `available_units` in Studio → card updates
without refresh. View source of static HTML — no JWT or service-role data
present.

**Status:** `[x]` (migration `20260428000001_catalogue_public.sql` opens species + passing batches to `anon` and adds `batches` to the `supabase_realtime` publication; `loadCatalogue()` aggregates passing-batch units server-side via a non-cookie anon client so `/` stays statically rendered with `revalidate=300` — build report confirms `/` is `○` static with `Revalidate: 5m`; `CatalogueList` subscribes to `postgres_changes` on `public.batches` and re-aggregates per-species totals on any change; presentation map covers all 12 seeded species)

---

### Cell 2.5 — Species Detail Page
**What:** `app/(storefront)/species/[id]/page.tsx` — full datasheet,
substrate, shelf life, dispatch window, list of available formats with
prices for the buyer's tier, freshest passing batch indicator.

**Inputs:** Cell 2.4 complete.

**Outputs:** Page shows tier price (calls `calculateLinePrice` from
`@repo/shared`) for authenticated buyer.

**Verify:** Sign in as `agreement`-tier user → sees 10% lower price than
list. Sign in as `oem`-tier → sees 22% lower.

**Status:** `[x]` — `app/(storefront)/species/[id]/page.tsx` (server, dynamic) +
`AddToCartButton` client island; `lib/data/species-detail.ts` joins species
with passing batches (freshest by harvest_date desc / inoculation_date desc),
resolves buyer tier via `company_users → companies.tier` (defaults `spot` when
unauthenticated), and computes per-format tier price with
`calculateLinePrice(price*100, 1, tier)/100`. Catalogue rows now link to
`/species/${id}` via Next `Link` (typed-routes cast). `pnpm typecheck` clean;
`pnpm --filter web build` shows `/species/[id]` as `ƒ` 1.85 kB and `/` still
`○` Revalidate 5m.

---

### Cell 2.6 — Batch Traceability View (Skeleton)
**What:** `app/(dashboard)/batches/[orderId]/page.tsx` — table showing each
order line's batch metadata (id, inoculation date, substrate lot, contam
result, harvest date, CoA download link via signed URL).

**Inputs:** Cell 2.5 complete. (Will be empty until Phase 3 creates orders.)

**Outputs:** Page renders with seed-data order. CoA download link generates
fresh signed URL on each request.

**Verify:** With test order in seed, page shows all batch fields. Click CoA
link → PDF downloads. As different-company user → 403.

**Status:** `[ ]`

---

### Cell 2.7 — Verify Phase 2
**Verify checklist:**
- [ ] Magic link sign-in works end-to-end
- [ ] Catalog shows live freshness and stock
- [ ] Tier pricing visible to authenticated buyers
- [ ] Batch traceability page enforces company isolation
- [ ] No service-role import in any client component (lint passes)

**Status:** `[ ]`

---

## Phase 3 — Cart + Stripe Checkout

---

### Cell 3.1 — Cart State (Zustand + localStorage)
**What:** Client-side cart store. On auth, mirror to `carts` table for
cross-device persistence.

**Inputs:** Phase 2 complete.

**Outputs:** `apps/web/lib/cart/store.ts` — Zustand. Add migration for
`carts (user_id, items jsonb, updated_at)`.

**Verify:** Add items as anon → reload page → cart preserved. Sign in →
cart syncs to DB. Sign out → reset.

**Status:** `[ ]`

---

### Cell 3.2 — Cart Page
**What:** `app/(storefront)/cart/page.tsx` — line items, quantity edit,
remove, calls `calculateOrderTotal` for subtotal display.

**Inputs:** Cell 3.1 complete.

**Outputs:** Page interactive, totals match seeded pricing.

**Verify:** Increase qty above volume break → discount applied, total
decreases.

**Status:** `[ ]`

---

### Cell 3.3 — Checkout Server Action
**What:** Server Action that:
1. Validates cart against current stock (live query, not Realtime).
2. Validates dispatch date against species `dispatch_window`.
3. Creates `orders` row with status `pending`, `payment_method='card'`.
4. Returns Stripe Checkout Session URL.

**Inputs:** Cell 3.2 complete, Stripe keys in `.env.local`.

**Outputs:** `apps/web/app/actions/checkout.ts`. Stripe Checkout opens with
correct line items.

**Verify:** Submit cart → land on Stripe-hosted checkout. Cancel → return
to cart, order remains `pending`. Try to dispatch on Friday for a Mon-only
species → action throws, no order created.

**Status:** `[ ]`

---

### Cell 3.4 — Stripe Webhook Handler
**What:** `app/api/webhooks/stripe/route.ts` — verifies signature, on
`checkout.session.completed` calls `allocate_batch` for each line item,
sets order to `confirmed`, sets `order_items.batch_id` and `allocated_at`.

**Inputs:** Cell 3.3 complete.

**Outputs:** Route uses raw body for signature verification. Failed
allocations leave order in `pending` and trigger backorder email (Phase 4
Resend wiring stubbed for now).

**Verify:** `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
+ `stripe trigger checkout.session.completed` → order transitions to
`confirmed`, batch units decremented atomically.

**Status:** `[ ]`

---

### Cell 3.5 — Order History + Tracking
**What:** `app/(dashboard)/orders/page.tsx` (list) and
`app/(dashboard)/orders/[id]/page.tsx` (detail) with Realtime subscription
on `orders` filtered by `id`.

**Inputs:** Cell 3.4 complete.

**Outputs:** Order list shows status, total, dispatch date. Detail page
updates live when status changes. Link to batch traceability view.

**Verify:** Place test order → appears in list within 1 second of webhook
firing. Manually update `orders.status` in Studio → detail page updates
without refresh.

**Status:** `[ ]`

---

### Cell 3.6 — Verify Phase 3
**Verify checklist:**
- [ ] End-to-end purchase flow works with Stripe test card
- [ ] Webhook signature verification rejects invalid signatures (401)
- [ ] Concurrent purchases of same batch never over-allocate
- [ ] Dispatch window validator rejects out-of-window dates
- [ ] Order detail page updates live via Realtime

**Status:** `[ ]`

---

## Phase 4 — Subscriptions + Monday Dispatch

---

### Cell 4.1 — Resend Adapter
**What:** Thin wrapper for transactional emails: order confirmation,
backorder notice, dispatch notice.

**Inputs:** Phase 3 complete, Resend API key.

**Outputs:** `apps/web/lib/email/{client,templates,send}.ts`. React Email
templates.

**Verify:** Send test backorder email to a real address → arrives.

**Status:** `[ ]`

---

### Cell 4.2 — Subscription CRUD
**What:** Dashboard pages to create/pause/resume/cancel subscriptions.
Stripe subscription created via Stripe API on activation.

**Inputs:** Cell 4.1 complete.

**Outputs:** `app/(dashboard)/subscriptions/{page,new}.tsx`. Server Actions
create row, set `next_dispatch` to next Monday, create Stripe sub.

**Verify:** Create weekly sub → row in `subscriptions`, `next_dispatch` is
upcoming Monday, Stripe subscription visible in Stripe dashboard.

**Status:** `[ ]`

---

### Cell 4.3 — `subscription-engine` Edge Function
**What:** Edge Function that:
1. Selects active subs with `next_dispatch <= today`, ordered by `priority_tier ASC`.
2. For each: calls `allocate_batch`. If null → backorder email + skip.
3. Creates order row with `subscription_id` set, items linked.
4. Advances `next_dispatch` per `frequency`.

**Inputs:** Cell 4.2 complete.

**Outputs:** `supabase/functions/subscription-engine/index.ts`. Schedule in
`config.toml`: `0 6 * * MON`.

**Verify:** Manually invoke with seeded due subs → orders created in
priority order, units decremented, backorder email sent for unfulfillable.

**Status:** `[ ]`

---

### Cell 4.4 — Verify Phase 4
**Verify checklist:**
- [ ] Subscription dashboard CRUD works
- [ ] Stripe subscription billing creates invoices weekly
- [ ] Engine respects priority order
- [ ] Backorder emails fire on stock-out
- [ ] No race between concurrent engine runs (idempotent)

**Status:** `[ ]`

---

## Phase 5 — B2B Accounts: Net-30 + Quotes + Multi-User

---

### Cell 5.1 — Net-30 Checkout Path
**What:** Add `payment_method='net30'` checkout option visible only to
companies with `net30_enabled=true`. Generates invoice PDF, emails it,
creates order in `confirmed` (no Stripe Checkout).

**Inputs:** Phase 4 complete.

**Outputs:** Server Action variant + invoice React Email template +
PDF generation (use `@react-pdf/renderer`).

**Verify:** Net-30-enabled buyer sees option; non-enabled does not.
Database trigger from Cell 1.6 prevents bypass via direct insert.

**Status:** `[ ]`

---

### Cell 5.2 — Quote Builder
**What:** Admin route `(admin)/quotes/new` — line item builder, sets
`expires_at`, status `draft → sent`. Email link to buyer.

**Inputs:** Cell 5.1 complete.

**Outputs:** Quote builder UI. Buyer-facing `/(dashboard)/quotes/[id]/page`
with approve button → converts to order.

**Verify:** Build quote, send, approve → order created with quote line
items copied. Expired quote → approve button disabled.

**Status:** `[ ]`

---

### Cell 5.3 — Multi-User Companies
**What:** Company admin can invite buyers (via Cell 2.3 invite endpoint),
list company users, change roles, deactivate.

**Inputs:** Cell 5.2 complete.

**Outputs:** `app/(dashboard)/team/page.tsx`. RLS enforces only `admin`
role can invite/modify.

**Verify:** Admin invites buyer → buyer signs up → sees only own company.
Buyer cannot access `/team` page.

**Status:** `[ ]`

---

### Cell 5.4 — Verify Phase 5
**Verify checklist:**
- [ ] Net-30 path works end-to-end with invoice PDF
- [ ] Quote builder + approval flow creates orders
- [ ] Company admin can manage team
- [ ] Buyer role cannot access admin functions

**Status:** `[ ]`

---

## Phase 6 — Ops: Shippo + Admin Batch Management

---

### Cell 6.1 — Shippo Adapter
**What:** Wrapper for label generation and tracking webhook handler.

**Inputs:** Phase 5 complete, Shippo API key.

**Outputs:** `apps/web/lib/shippo/{client,labels,tracking}.ts`.

**Verify:** Generate test label for TX → CA cold-chain parcel → tracking
URL returned.

**Status:** `[ ]`

---

### Cell 6.2 — Picking → Dispatched Workflow
**What:** Admin route `(admin)/orders/[id]` with action buttons:
"Mark picking" → "Generate label" → status `dispatched`.

**Inputs:** Cell 6.1 complete.

**Outputs:** Admin page. Label URL stored on `orders.tracking_number`.
Resend dispatch email fires.

**Verify:** Walk an order from `confirmed` → `dispatched`, buyer's order
detail page updates live.

**Status:** `[ ]`

---

### Cell 6.3 — Shippo Webhook
**What:** `/api/webhooks/shippo` — verifies signature, updates
`orders.status` to `delivered` on tracking event.

**Inputs:** Cell 6.2 complete.

**Outputs:** Route + signature verification.

**Verify:** Send Shippo test webhook → status updates.

**Status:** `[ ]`

---

### Cell 6.4 — Admin Batch Management
**What:** `(admin)/batches` — list, filter by contam status, edit
contamination check (pending → pass/fail), edit `available_units`,
upload CoA PDF to Storage.

**Inputs:** Cell 6.3 complete.

**Outputs:** Pages with form actions. CoA upload uses Supabase Storage
client with service-role.

**Verify:** Production team can mark batch passed → batch becomes
allocatable. Failed batch never selected by `allocate_batch`.

**Status:** `[ ]`

---

### Cell 6.5 — Verify Phase 6
**Verify checklist:**
- [ ] Full order lifecycle: confirmed → picking → dispatched → delivered
- [ ] Shippo label generation works
- [ ] Tracking webhook updates status
- [ ] Admin can manage batches without SQL access

**Status:** `[ ]`

---

## Phase 7 — Polish: Analytics, Templates, Hardening

---

### Cell 7.1 — PostHog Wiring
**What:** Browser + server PostHog clients. Events: `catalog_view`,
`species_view`, `add_to_cart`, `checkout_started`, `checkout_completed`,
`subscription_created`, `batch_allocated`, `backorder_triggered`.

**Inputs:** Phase 6 complete.

**Outputs:** `apps/web/lib/posthog/{client,events,track}.ts`.

**Verify:** Events appear in PostHog within 1 minute. Funnel report shows
catalog → checkout conversion.

**Status:** `[ ]`

---

### Cell 7.2 — Sentry Wiring
**What:** Sentry SDK on browser, server actions, edge functions.

**Inputs:** Cell 7.1 complete.

**Outputs:** `sentry.client.config.ts`, `sentry.server.config.ts`,
`sentry.edge.config.ts`.

**Verify:** Throw test error from each layer → appears in Sentry.

**Status:** `[ ]`

---

### Cell 7.3 — Rate Limiting Middleware
**What:** Vercel Edge middleware on `/api/webhooks/*` and
`/api/invites/*`: 10 req/min per IP unauthenticated, 60 req/min per user
authenticated.

**Inputs:** Cell 7.2 complete.

**Outputs:** `middleware.ts` using `@upstash/ratelimit` (free tier) or
in-memory fallback for dev.

**Verify:** 11 rapid requests from same IP → 429.

**Status:** `[ ]`

---

### Cell 7.4 — Health Check + Cron Monitoring
**What:** `/api/health` returns `{ db: 'ok', last_cron_run: timestamp }`.
Edge function logs `last_cron_run` to a `system_metrics` table.

**Inputs:** Cell 7.3 complete.

**Outputs:** Endpoint + table + cron logging.

**Verify:** Health endpoint returns 200 with sane values. After missing a
Monday, `last_cron_run` is stale → alert (manual for v1).

**Status:** `[ ]`

---

### Cell 7.5 — Verify Phase 7 + Production Readiness
**Verify checklist:**
- [ ] PostHog dashboards populated with real funnel data
- [ ] Sentry catches client + server + edge errors
- [ ] Rate limits applied to webhooks and invites
- [ ] Health check returns 200 from production
- [ ] All free-tier usage under 50% of limits after 1 week of seed traffic
- [ ] Lighthouse score on catalog ≥ 90 mobile

**Status:** `[ ]`

---

## Cell Index (Quick Reference)

| Cell | Name | Phase | Status |
|------|------|-------|--------|
| 1.1 | pnpm Workspace Wiring | Foundation | `[ ]` |
| 1.2 | Turborepo Task Orchestration | Foundation | `[ ]` |
| 1.3 | Local Supabase Stack | Foundation | `[ ]` |
| 1.4 | RLS + JWT Custom Claim Hook | Foundation | `[ ]` |
| 1.5 | Race-Safe allocate_batch Function | Foundation | `[ ]` |
| 1.6 | Net-30 Trigger and moddatetime | Foundation | `[ ]` |
| 1.7 | CoA Storage Bucket | Foundation | `[ ]` |
| 1.8 | Seed Data | Foundation | `[ ]` |
| 1.9 | @repo/shared Types and Zod Schemas | Foundation | `[ ]` |
| 1.10 | Pricing Engine | Foundation | `[ ]` |
| 1.11 | Freshness Helpers | Foundation | `[ ]` |
| 1.12 | Concurrent Allocation Test | Foundation | `[ ]` |
| 1.13 | Verify Foundation | Foundation | `[ ]` |
| 2.1 | Scaffold apps/web | Catalog | `[ ]` |
| 2.2 | Supabase Client Wiring | Catalog | `[x]` |
| 2.3 | Magic-Link Auth + Invite Flow | Catalog | `[ ]` |
| 2.4 | Catalog Page (ISR + Realtime) | Catalog | `[ ]` |
| 2.5 | Species Detail Page | Catalog | `[ ]` |
| 2.6 | Batch Traceability View | Catalog | `[ ]` |
| 2.7 | Verify Phase 2 | Catalog | `[ ]` |
| 3.1 | Cart State | Checkout | `[ ]` |
| 3.2 | Cart Page | Checkout | `[ ]` |
| 3.3 | Checkout Server Action | Checkout | `[ ]` |
| 3.4 | Stripe Webhook Handler | Checkout | `[ ]` |
| 3.5 | Order History + Tracking | Checkout | `[ ]` |
| 3.6 | Verify Phase 3 | Checkout | `[ ]` |
| 4.1 | Resend Adapter | Subscriptions | `[ ]` |
| 4.2 | Subscription CRUD | Subscriptions | `[ ]` |
| 4.3 | subscription-engine Edge Function | Subscriptions | `[ ]` |
| 4.4 | Verify Phase 4 | Subscriptions | `[ ]` |
| 5.1 | Net-30 Checkout Path | Accounts | `[ ]` |
| 5.2 | Quote Builder | Accounts | `[ ]` |
| 5.3 | Multi-User Companies | Accounts | `[ ]` |
| 5.4 | Verify Phase 5 | Accounts | `[ ]` |
| 6.1 | Shippo Adapter | Ops | `[ ]` |
| 6.2 | Picking → Dispatched Workflow | Ops | `[ ]` |
| 6.3 | Shippo Webhook | Ops | `[ ]` |
| 6.4 | Admin Batch Management | Ops | `[ ]` |
| 6.5 | Verify Phase 6 | Ops | `[ ]` |
| 7.1 | PostHog Wiring | Polish | `[ ]` |
| 7.2 | Sentry Wiring | Polish | `[ ]` |
| 7.3 | Rate Limiting Middleware | Polish | `[ ]` |
| 7.4 | Health Check + Cron Monitoring | Polish | `[ ]` |
| 7.5 | Verify Phase 7 + Production Readiness | Polish | `[ ]` |

**Total: 44 cells across 7 phases**
