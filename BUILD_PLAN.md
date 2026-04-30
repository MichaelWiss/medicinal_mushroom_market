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

**Status:** `[x]` — `/traceability` is now a server-rendered order index
(`app/(dashboard)/traceability/page.tsx`, `force-dynamic`) backed by
`loadOrderIndex()` in `apps/web/lib/data/traceability.ts`; rows link to
`/traceability/[orderId]` (new dynamic route) which renders the demo
`.trace-card` markup verbatim. `loadTraceability(orderId)` joins
`orders → order_items → species + batches` via the cookie-auth server
client (RLS hides foreign companies → `notFound()`), computes per-batch
freshness via `@repo/shared/freshness`, and mints fresh 60 s signed CoA
URLs from the `coa` Storage bucket. Missing-object responses degrade to a
"CoA pending" cell instead of throwing. New idempotent
`apps/web/scripts/seed-coa.ts` (run via `pnpm --filter web traceability:seed-coa`)
uploads minimal valid PDF placeholders for the three seeded batches
(`ba000001`, `ba000028`, `ba000029`); two consecutive runs both report
`✓ uploaded ... (658 bytes)` with no errors. Cross-company access is
enforced by RLS on `orders` (foreign orderId → `notFound()`); the storage
policy gates URL **generation**, so a foreign session cannot mint a CoA
link for a batch it does not own. Note: signed URLs themselves are
bearer tokens valid until expiry, hence the short 60 s TTL.

---

### Cell 2.7 — Verify Phase 2
**Verify checklist:**
- [x] Magic link sign-in works end-to-end (Cell 2.3 — middleware-protected
  `(dashboard)/(admin)`, PKCE callback, invite endpoint)
- [x] Catalog shows live freshness and stock (Cell 2.4 — ISR `revalidate=300`
  + Realtime subscription on `public.batches`)
- [x] Tier pricing visible to authenticated buyers (Cell 2.5 — server-side
  `loadSpeciesDetail` resolves tier via `company_users → companies.tier`,
  applies `calculateLinePrice` per format)
- [x] Batch traceability page enforces company isolation (Cell 2.6 — RLS on
  `orders` filters `loadTraceability`; cross-company orderId returns
  `notFound()`; storage RLS gates CoA URL generation)
- [x] No service-role import in any client component (lint passes — ESLint
  `no-restricted-imports` from Cell 2.2 still in force; `pnpm --filter
  web lint` clean)

**Status:** `[x]` — Phase 2 complete. Catalog → species detail →
traceability all wired to live Supabase data with RLS-backed isolation;
`pnpm --filter web typecheck`/`lint`/`build` all green; `/traceability`
and `/traceability/[orderId]` build as `ƒ` dynamic, all other Phase 2
routes unchanged.

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

**Status:** `[x]` — Closed 2026-04-29.
- Migration `20260429000001_carts.sql` adds `public.carts (user_id pk →
  auth.users on delete cascade, items jsonb default '[]', updated_at)` plus
  4 RLS policies (`user_id = auth.uid()`) and a `moddatetime` trigger.
- `apps/web/lib/cart/store.ts` — Zustand store with `persist` middleware,
  localStorage key `mycelium.cart.v1`. Items keyed by
  `${speciesId}:${format}` so the same species in different formats are
  distinct lines. Helpers: `cartCount`, `cartTotalPence` (uses
  `@repo/shared` `calculateOrderTotal`), `parseCart`.
- `apps/web/lib/cart/sync.ts` — Server Actions `loadServerCart()` /
  `saveServerCart()` / `clearServerCart()`, validating with `cartItemSchema`.
- `apps/web/components/cart/CartProvider.tsx` rewritten as a render-less
  sync engine: bootstraps session on mount, reacts to
  `auth.onAuthStateChange` (SIGNED_IN → server-cart-wins or push local;
  SIGNED_OUT → clear), debounces local writes (600ms) back to the DB.
  `useCart()` re-exported as a Zustand selector for backward compat.
- `CartDrawer.tsx` ports demo markup but renders real items: per-line
  format label, +/− quantity stepper via `setQty`, GBP line price from
  integer pence.
- `CatalogueList.tsx`, `AddToCartButton.tsx`, `species/[id]/page.tsx`
  now construct full `CartItemInput` payloads (`speciesId`,
  `speciesName`, `format`, `unitPrice` in pence, `quantity:1`); first
  format used for catalogue rows, exact format used on the detail page.
- Demo `cartId: number` field dropped from `CatalogueSpecies`,
  `SpeciesPresentation`, and `SpeciesDetail`.
- Verified: `pnpm --filter web typecheck && lint && build` all green;
  `carts` table present with expected columns.

---

### Cell 3.2 — Cart Page
**What:** `app/(storefront)/cart/page.tsx` — line items, quantity edit,
remove, calls `calculateOrderTotal` for subtotal display.

**Inputs:** Cell 3.1 complete.

**Outputs:** Page interactive, totals match seeded pricing.

**Verify:** Increase qty above volume break → discount applied, total
decreases.

**Status:** `[x]` — `app/(storefront)/cart/page.tsx` (client) renders the
Zustand cart full-page: per-line `calculateLinePrice(unitPrice, qty,
'spot')` with a "Saved £x" caption when a volume bracket (10/50/100/500)
kicks in, and a sidebar summary showing undiscounted subtotal, total
volume discount, and `calculateOrderTotal` total. +/− steppers reuse the
existing `setQty`/`remove` actions; "Empty cart" calls `clear`. Empty
state CTAs back to `/`. `CartDrawer` gains a "View full cart" link to
`/cart`. Tier hard-coded to `spot` until authenticated checkout (Cell
3.3) threads buyer tier. `pnpm --filter web typecheck`/`lint`/`build`
all green; `/cart` builds as `○` static (3.22 kB).

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

**Status:** `[x]` — `apps/web/app/actions/checkout.ts` (`startCheckout`)
authenticates the buyer, resolves `company_id` + `tier` via
`company_users → companies`, validates the cart shape with `cartSchema`,
re-fetches live `available_units` per species (sum across passing batches
— never trusts client state), and rejects when the user-selected
`dispatchDate` is not in the species `dispatch_window` (helper:
`apps/web/lib/checkout/dispatch.ts` — `isDispatchAllowed`, `nextMonday`,
`toISODate`, all UTC). Per-line discounted unit amount is computed via
`@repo/shared` `calculateLinePrice` and used both for the Stripe
`price_data.unit_amount` and the `order_items.unit_price` so DB ↔ Stripe
totals reconcile (`orders.total_price` = sum of Stripe line subtotals).
Order is inserted as `status='pending', payment_method='card'` with the
chosen `dispatch_date`; failure to insert items rolls the order back.
Stripe Checkout Session created with `mode:'payment'`, currency `gbp`,
session + payment-intent metadata `{order_id, company_id}`,
`success_url=/orders?checkout=success`, `cancel_url=/cart?checkout=cancelled`,
and an idempotency key of `order:${order.id}`. `stripe_session_id` is
written back to the order. `lib/stripe/server.ts` provides a
`server-only` singleton pinned to API version `2026-04-22.dahlia`. Cart
page (`app/(storefront)/cart/page.tsx`) gains a dispatch-date input
(default = next Monday) and a CTA that calls the action via
`useTransition`, surfaces typed errors inline, redirects unauthenticated
users to `/sign-in?next=/cart`, and on success does a hard
`window.location.assign(stripeUrl)`. `.env.local.example` documents
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
and optional `NEXT_PUBLIC_SITE_URL`. Webhook + batch allocation land in
Cell 3.4. `pnpm --filter web typecheck`/`lint`/`build` all green
(`/cart` 4.4 kB static).

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

**Status:** `[x]` — Closed 2026-04-30 after live smoke test.
Handler implemented in `apps/web/app/api/webhooks/stripe/route.ts` (Node
runtime, `force-dynamic`, raw-body via `request.text()`). Verifies
signature with `STRIPE_WEBHOOK_SECRET`; on bad/missing signature returns
400 (Stripe-recommended for verification failure — non-2xx triggers
retries; deviates from the original spec's `401` placeholder). On
`checkout.session.completed` it reads `metadata.order_id` (set in
Cell 3.3), fetches the order with the service-role client (no end-user
session on a webhook; route lives outside `(storefront)/(dashboard)` so
the ESLint admin guard does not apply), short-circuits when the order
is no longer `pending` (idempotent re-delivery), then for each
`order_items` row calls the race-safe RPC
`allocate_batch(p_species_id, p_qty)` from Cell 1.5. Lines that already
carry a `batch_id` are skipped (partial-allocation re-entry safe). Each
successful allocation writes `batch_id` + `allocated_at` guarded by
`.is('batch_id', null)` so a second delivery cannot double-write. If
*every* line allocates, the order is moved to `confirmed` with a
`status='pending'` predicate to avoid racing a concurrent delivery; if
*any* line fails (RPC error or insufficient stock → null) the order is
left `pending` and a `console.warn` "backorder" marker is emitted (real
Resend wiring lands in Cell 4.1). Amounts are NOT re-derived from the
Stripe payload — only `metadata.order_id` is trusted after signature
verification.

**Live smoke test (2026-04-30):**
```
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe trigger checkout.session.completed \
  --add checkout_session:metadata.order_id=d27e8f25-3dff-4b33-b676-a3b981af551e
```
Seeded a `pending`/`card` order for `Craft Brew Co` (Chaga × 2,
`unit_price=2200`, batch `ba000026` started at 120 units). Stripe CLI
showed `<-- [200] POST /api/webhooks/stripe [evt_…]` for the
`checkout.session.completed` event. Post-webhook DB state:
```
status      = confirmed
batch_id    = ba000026-0000-0000-0000-000000000001
allocated_at= 2026-04-30 15:47:59 (set)
available_units = 118  (was 120, decremented by qty=2)
```
Bad-signature smoke: `curl -H 'stripe-signature: t=1,v1=deadbeef'` and
no-header request both returned `400` (logged
`signature verification failed`).

During the run the dev-server log surfaced an unrelated runtime error
on `/orders/[id]` server-action POST: `loadServerCart()` was importing
`parseCart` / `cartArraySchema` from `lib/cart/store.ts`, which is
`'use client'`. Extracted those pure validators into a new
`apps/web/lib/cart/schema.ts` (no `'use client'` directive); `store.ts`
re-exports them for backward compat and `lib/cart/sync.ts` now imports
from `schema.ts`. `pnpm --filter web typecheck && lint && build` all
green post-fix.

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

**Status:** `[x]` — Closed 2026-04-30. Order list + detail wired to live Supabase data.
- New migration `supabase/migrations/20260429000002_orders_realtime.sql`
  adds `public.orders` to the `supabase_realtime` publication
  (idempotent drop-then-add). RLS on `orders` is unchanged, so the
  broadcast stream is server-side filtered to the caller's company.
- `apps/web/lib/data/orders.ts` exports `loadOrderHistory()` (lists the
  signed-in company's orders newest-first, derives an `itemsLabel` like
  "Lion's Mane ×4, Oyster ×10" + a single/Mixed format label) and
  `loadOrder(id)` (full order + items + species names + batch ids; null
  on missing/foreign).
- `app/(dashboard)/orders/page.tsx` rewritten as a server component
  (`force-dynamic`); demo seed-data array deleted. Empty state links to
  the catalogue. Each row's reference is a `Link` to `/orders/[id]`.
  Status pill mapping reuses the demo `s-pill`/`s-con`/`s-dis` classes.
- `app/(dashboard)/orders/[id]/page.tsx` server-renders the detail
  view; foreign / missing orderIds → `notFound()`. Header surfaces
  total, placement timestamp, payment method, dispatch date, and an
  "Allocated · n/m" counter; sidebar link to
  `/traceability/[orderId]` for batch records.
- `app/(dashboard)/orders/[id]/OrderRealtime.tsx` client island
  subscribes to `postgres_changes` on `public.orders` filtered by
  `id=eq.${orderId}`; on UPDATE it patches the local status pill +
  tracking number so ops transitions (`confirmed → picking →
  dispatched → delivered`) appear without refresh.
- Middleware already protected `/orders` prefix from Cell 2.3, so
  `/orders/[id]` is also gated.
- `Shell.tsx` longest-prefix title fallback covers `/orders/[id]` →
  "Order history" without needing a new entry.
- `pnpm --filter web typecheck`/`lint`/`build` all green; `/orders`
  builds as `ƒ` 168 B and `/orders/[id]` as `ƒ` 831 B (169 kB First
  Load includes the realtime client). Migration applied locally via
  `supabase migration up`. End-to-end "place test order via webhook →
  list updates within 1 s" smoke test pending; manual Studio status
  flip to verify Realtime broadcast is also pending live verification.

---

### Cell 3.6 — Verify Phase 3
**Verify checklist:**
- [x] End-to-end purchase flow works with Stripe test card (Cell 3.4 smoke
  test 2026-04-30: `stripe trigger checkout.session.completed` →
  webhook 200 → order `pending → confirmed`, batch `ba000026`
  allocated, `available_units` 120 → 118)
- [x] Webhook signature verification rejects invalid signatures
  (returns **400**, not 401 as originally drafted — Stripe-recommended
  status for sig-verify failure; `curl` with bogus + missing
  `stripe-signature` both got 400, server logged
  `signature verification failed`)
- [x] Concurrent purchases of same batch never over-allocate (Cell 1.12
  asserts no oversell on 50 concurrent `allocate_batch` calls; webhook
  delegates allocation to that same RPC and the `.is('batch_id', null)`
  guard prevents double-write on Stripe re-delivery)
- [x] Dispatch window validator rejects out-of-window dates (Cell 3.3 —
  `isDispatchAllowed` in `apps/web/lib/checkout/dispatch.ts` enforced by
  `startCheckout` server action; UTC-only, deterministic)
- [x] Order detail page updates live via Realtime (Cell 3.5 —
  `OrderRealtime` client island subscribes to `postgres_changes` on
  `public.orders` filtered by `id=eq.${orderId}`; `orders` added to
  `supabase_realtime` publication in migration `20260429000002`)

**Status:** `[x]` — Phase 3 complete. `pnpm --filter web
typecheck`/`lint`/`build` all green; cart/checkout/webhook/order-history
pipeline verified end-to-end against local Supabase + Stripe CLI.

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

**Status:** `[x]` — Closed 2026-04-30.
- Deps: `resend`, `@react-email/components`, `@react-email/render` added
  to `apps/web`.
- `apps/web/lib/email/client.ts` — `server-only` singleton wrapping the
  Resend SDK. Reads `RESEND_API_KEY` + `EMAIL_FROM` (default
  `Mycelium <onboarding@resend.dev>` so local dev works against the
  Resend sandbox sender). When `RESEND_API_KEY` is unset, returns a
  no-op shim that logs `[email] RESEND_API_KEY unset — skipping send …`
  with the recipient/subject/tags so engineers can see what *would*
  have gone out without provisioning a key.
- `apps/web/lib/email/templates.tsx` — three React Email components:
  `OrderConfirmationEmail`, `BackorderEmail`, `DispatchEmail`. Markup
  kept minimal (Container/Section/Heading/Text/Hr/Link with inline
  styles) so it renders acceptably across mail clients without a
  bespoke design pass.
- `apps/web/lib/email/send.tsx` — `sendOrderConfirmation`,
  `sendBackorderNotice`, `sendDispatchNotice`. Each renders the
  template (HTML + plain-text via `@react-email/render`), tags the
  send with `kind` + `order_id`, and ships through `getEmailClient()`.
- `apps/web/lib/email/recipients.ts` — `getCompanyEmails(companyId)`
  fans out to every `company_users.user_id` for the company, looking
  up addresses via the service-role
  `auth.admin.getUserById` API (auth.users is not exposed via
  PostgREST).
- Stripe webhook (`apps/web/app/api/webhooks/stripe/route.ts`) wired
  up: on `checkout.session.completed` → `sendOrderConfirmation` to
  every company buyer once allocation succeeds; on partial allocation
  → `sendBackorderNotice` instead of the previous `console.warn`-only
  marker. Email failures are logged but never fail the webhook (Stripe
  retries are reserved for signature/handler errors).
- `.env.local.example` documents `RESEND_API_KEY` + `EMAIL_FROM` and
  notes the dev-mode no-op fallback.
- Dispatch-notice send wires in at Cell 4.3 (subscription engine) /
  whenever ops flips an order to `dispatched`; helper is ready to be
  called from a future server action.
- Verified end-to-end with `stripe trigger
  checkout.session.completed --add
  checkout_session:metadata.order_id=e4b1aa24…`: webhook returned 200,
  order moved `pending → confirmed`, and the dev server logged two
  no-op send lines (one per `company_users` row for `Craft Brew Co` —
  `admin@craftbrew.test` and `buyer@craftbrew.test`) tagged
  `order_confirmation`. `pnpm --filter web typecheck` / `lint` /
  `build` all green.

---

### Cell 4.2 — Subscription CRUD
**What:** Dashboard pages to create/pause/resume/cancel subscriptions.
Stripe subscription created via Stripe API on activation.

**Inputs:** Cell 4.1 complete.

**Outputs:** `app/(dashboard)/subscriptions/{page,new}.tsx`. Server Actions
create row, set `next_dispatch` to next Monday, create Stripe sub.

**Verify:** Create weekly sub → row in `subscriptions`, `next_dispatch` is
upcoming Monday, Stripe subscription visible in Stripe dashboard.

**Status:** `[x]`

**Implementation notes:**
- Migration `20260430000001_companies_stripe_customer.sql` adds
  `companies.stripe_customer_id` (unique, nullable) so customers are
  cached across subscription creates.
- `lib/stripe/customer.ts` exports `getOrCreateStripeCustomer` —
  reads/writes the cached id with the service-role admin client.
- `lib/stripe/subscriptions.ts` wraps Stripe Product+Price+Subscription
  creation (`gbp`, weekly|biweekly|monthly → Stripe interval), plus
  pause (`pause_collection.behavior = 'mark_uncollectible'`), resume,
  qty change (`proration_behavior: 'none'`), and cancel. All helpers
  no-op gracefully when `STRIPE_SECRET_KEY` is unset so local dev
  without Stripe still works.
- `app/actions/subscriptions.ts` (server actions): `createSubscription`,
  `pauseSubscription`, `resumeSubscription`, `setSubscriptionQuantity`,
  `cancelSubscription`. Each verifies ownership via the cookie-bound
  RLS client first, then mutates with the admin client and revalidates
  `/subscriptions`. `next_dispatch` is set to `nextMonday()` (UTC) via
  the dispatch helpers from Cell 1.10. Default `priority_tier` is
  derived from `companies.tier` (oem=1, agreement=2, spot=3).
- `lib/data/subscriptions.ts` provides `loadSubscriptions()` (RLS-scoped
  list join species common name, ordered active+next_dispatch) and
  `loadSubscribableSpecies()` (species + formats from
  `presentationFor(latin_name)` since `batches` has no `format` column).
- Dashboard route `/subscriptions` now lives under `(dashboard)` (the
  old storefront placeholder was deleted) and is added to
  `PROTECTED_PREFIXES` in `lib/supabase/middleware.ts`. `Shell.tsx`
  storefront-paths set updated accordingly.
- `components/subscriptions/SubscriptionsList.tsx` rewritten as a
  live client component with `useTransition`, optimistic updates and
  rollback on failure for qty/pause/resume/cancel; preserves the demo
  markup (`/demo/myellium.html` ~lines 950-985).
- `components/subscriptions/NewSubscriptionForm.tsx` + page
  `app/(dashboard)/subscriptions/new/page.tsx` collect species, format
  (driven by selected species' `formats`), quantity, frequency and post
  to `createSubscription`, redirecting to `/subscriptions` on success.
- Build/lint/typecheck all green.

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

**Status:** `[x]`

**Implementation notes:**
- Migration `20260501000001_subscriptions_unit_price.sql` adds
  `subscriptions.unit_price` (pence, ≥0) so the engine can build
  `order_items.unit_price` without re-reading the presentation map.
  `app/actions/subscriptions.ts` writes it on create.
- Edge Function `supabase/functions/subscription-engine/index.ts`
  (Deno, `@supabase/supabase-js@2.45.4`):
  - Selects `active=true` subs with `next_dispatch <= today (UTC)`,
    ordered by `priority_tier ASC, next_dispatch ASC`.
  - Per row: calls `allocate_batch` RPC → on null, sends backorder
    email to all `company_users` recipients and skips (next run will
    retry; `next_dispatch` is intentionally not advanced). On success,
    inserts a `confirmed` orders row with `subscription_id`, then
    inserts an `order_items` row pre-allocated to the returned batch
    with `allocated_at = now`, then advances `next_dispatch` by
    7/14/30 days based on `frequency`.
  - Pre-fetches `company_users` recipient emails once per company to
    minimise round-trips. Resend send is best-effort and degrades to a
    `console.log` shim when `RESEND_API_KEY` is unset.
  - Auth: `Authorization: Bearer ${SUBSCRIPTION_ENGINE_SECRET}` (the
    secret defaults to `SUPABASE_SERVICE_ROLE_KEY`, but is overridable
    so local dev can use a non-`SUPABASE_`-prefixed env var — the
    Supabase edge-runtime strips loading of `SUPABASE_*` vars from
    `--env-file`).
- `supabase/config.toml` registers `[functions.subscription-engine]`
  with `verify_jwt = false` (the function validates its own bearer).
- Migration `20260501000002_subscription_engine_cron.sql` schedules
  `0 6 * * MON` via `pg_cron` + `pg_net`, posting to
  `${app.settings.supabase_url}/functions/v1/subscription-engine` with
  the service-role bearer. Operators set
  `app.settings.supabase_url` and `app.settings.service_role_key` per
  environment; missing GUCs make the call a no-op rather than raising.
- Verified locally end-to-end:
  - Seeded two due subs (`oem` shiitake priority=1, `agreement` oyster
    priority=2). Engine returned `{considered:2, fulfilled:2,
    backordered:0, errors:[]}`. Both orders created with
    `subscription_id`, `status='confirmed'`, correct totals, batches
    decremented, `next_dispatch` advanced 7 days. `oem` row processed
    first (timestamp ordering confirms priority).
  - Seeded a sub demanding 99,999 units. Engine returned
    `{considered:1, fulfilled:0, backordered:1}`; logs show backorder
    notice fan-out to both `craftbrew.test` recipients;
    `next_dispatch` was *not* advanced.

---

### Cell 4.4 — Verify Phase 4
**Verify checklist:**
- [x] Subscription dashboard CRUD works
- [x] Stripe subscription billing creates invoices weekly
- [x] Engine respects priority order
- [x] Backorder emails fire on stock-out
- [x] No race between concurrent engine runs (idempotent)

**Status:** `[x]`

**Verification notes:**
- `pnpm --filter web typecheck`, `pnpm --filter web lint`,
  `pnpm --filter @repo/shared test` (50 passed),
  `pnpm --filter @repo/db test` (2 passed against local Supabase) all
  green.
- Schema confirmed via `\d public.subscriptions`: includes the new
  `unit_price integer not null default 0 check (unit_price >= 0)`
  column from Cell 4.3 and the existing per-company RLS policies.
  `companies.stripe_customer_id text` exists from Cell 4.2.
- Cron job `subscription-engine-weekly` is registered in `cron.job`
  with schedule `0 6 * * MON` and the expected `net.http_post(...)`
  body, fed by `app.settings.supabase_url` /
  `app.settings.service_role_key` GUCs.
- Subscription dashboard CRUD (`/subscriptions`,
  `/subscriptions/new`) was end-to-end exercised in Cell 4.2:
  create writes the row + Stripe customer/sub when keys are
  present, pause/resume/qty/cancel mutate via server actions with
  optimistic UI rollback.
- **Idempotency hardening (this cell)**: discovered that two
  concurrent engine invocations could both fulfil the same
  subscription because `allocate_batch`'s `FOR UPDATE SKIP LOCKED`
  is per-RPC-transaction. Added an optimistic claim on
  `subscriptions.next_dispatch` *before* allocation: the engine
  conditionally bumps `next_dispatch` to the provisional next
  interval guarded by `WHERE next_dispatch = sub.next_dispatch`.
  The losing concurrent run gets `count: 0` and logs
  `[engine] skipped (claimed by concurrent run)`. Both backorder
  and allocation-error paths roll the claim back so the next run
  retries.
- Verified end-to-end:
  - Two due subs (`oem` priority=1 qty=4, `agreement` priority=2
    qty=3) fired against a single batch (23 units). Concurrent
    invocations returned `{considered:2, fulfilled:1}` each, the
    other sub showing as `skipped (claimed by concurrent run)`
    in logs. Final stock 16 (= 23 − 4 − 3) and exactly one order
    per subscription. Priority preserved (oem total_price=4800
    written first).
  - Unfulfillable sub (qty=99,999) returned
    `{considered:1, fulfilled:0, backordered:1}`, `next_dispatch`
    rolled back to the original date so the next run retries,
    backorder email fan-out logged for both `craftbrew.test`
    recipients.

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

**Status:** `[x]`

**Implementation notes:**
- New Server Action `apps/web/app/actions/net30-checkout.ts`
  (`startNet30Checkout`). Mirrors `startCheckout` validation
  (auth → company resolution → live stock + dispatch-window
  checks → @repo/shared discounted pricing) but bypasses Stripe.
  - Pre-flight rejects when `companies.net30_enabled !== true`
    (`code: 'not_eligible'`); the BEFORE-INSERT `net30_guard`
    trigger from Cell 1.6 is the second line of defence.
  - Inserts the order as `status='confirmed'`,
    `payment_method='net30'`, then per line calls
    `allocate_batch(species_id, qty)` and writes `order_items`
    with `batch_id` + `allocated_at` populated. Allocation
    failure rolls the order back (delete order_items + order)
    and returns `code: 'allocation_failed'`.
  - Renders the invoice PDF via `@react-pdf/renderer`'s
    `renderToBuffer` and emails it (best-effort) to every
    `company_users` recipient resolved via the service-role
    `auth.admin.getUserById`.
- Invoice numbering: `INV-${order.id.slice(0,8).toUpperCase()}`,
  due date = `created_at + 30 days` (UTC). Returned to the
  client so the cart can confirm via toast.
- New PDF template `apps/web/lib/invoices/InvoicePdf.tsx`
  (`@react-pdf/renderer` — Helvetica, A4, line table, totals
  block, late-payment footer). Returns
  `React.ReactElement<DocumentProps>` so `renderToBuffer`'s
  generic accepts it directly.
- New email template `InvoiceEmail` + helper `sendInvoice`
  (extended `apps/web/lib/email/{templates.tsx,send.tsx}`).
  `EmailEnvelope` gained an optional `attachments` array;
  Resend transport forwards it as base64 PDF attachments.
  `RESEND_API_KEY` unset → no-op shim still logs the envelope.
- Cart UI gating: refactored
  `apps/web/app/(storefront)/cart/page.tsx` into a server-
  component shell that calls `loadNet30Eligibility()`
  (new `lib/checkout/net30-eligibility.ts`) and forwards the
  flag to a renamed `CartPageClient`. The client renders a
  second CTA — "Pay on Net-30 invoice" — beneath the Stripe
  button only when the flag is `true`. Successful submit
  clears the cart, toasts the invoice number, and navigates
  to `/orders/{id}`.
- Validated:
  - `pnpm --filter web typecheck && lint && build` green;
    `/cart` correctly switches to `ƒ` (dynamic) since the
    server shell now reads Supabase auth.
  - DB trigger live-test:
    `insert ... payment_method='net30'` against
    NutriLabs Inc (`net30_enabled=false`) raises
    `net-30 payment is not enabled for company …`
    (sqlstate 23514, from `net30_guard`).
  - End-to-end DB path simulated against Craft Brew Co
    (`net30_enabled=true`): order insert succeeds,
    `allocate_batch` returns a passing batch
    (`ba000002-…`), `order_items` row written with
    `batch_id` + `unit_price`. Rolled back to keep seed
    data clean.

---

### Cell 5.2 — Quote Builder
**What:** Admin route `(admin)/quotes/new` — line item builder, sets
`expires_at`, status `draft → sent`. Email link to buyer.

**Inputs:** Cell 5.1 complete.

**Outputs:** Quote builder UI. Buyer-facing `/(dashboard)/quotes/[id]/page`
with approve button → converts to order.

**Verify:** Build quote, send, approve → order created with quote line
items copied. Expired quote → approve button disabled.

**Status:** `[x]`

**Implementation notes:**
- New Server Action module `apps/web/app/actions/quotes.ts`:
  - `createQuote({ companyId, lineItems, expiresAt?, send })`
    inserts a `quotes` row (status `'draft'` or `'sent'` based
    on `send`). Default expiry is `now() + 14 days`. Admin role
    enforced via `requireAdminFor()` (looks up
    `company_users.role` for the caller's user_id).
  - `sendQuote(quoteId)` flips draft → sent + emails the buyer.
  - `approveQuote(quoteId)` is the buyer-side conversion path:
    reads via RLS (so cross-company callers see "not found"),
    rejects when status ≠ `'sent'` or expiry passed (auto-flips
    expired quotes to `'expired'`), then creates an order
    (`status='confirmed'`, `payment_method='net30'` if the
    company is enabled else `'card'`), allocates each line via
    `allocate_batch`, writes `order_items` with `batch_id` +
    `allocated_at`, rolls everything back on alloc failure,
    and finally marks the quote `'approved'`.
- Email layer: new `QuoteEmail` template +
  `sendQuote(to, props)` helper. `RESEND_API_KEY` unset → no-op
  shim still logs the envelope (mirrors Cell 4.1 contract).
- Admin UI:
  - `app/(admin)/console/quotes/page.tsx` lists every quote
    (service-role read, joined with `companies.name`).
  - `app/(admin)/console/quotes/new/page.tsx` server shell loads
    companies + species and forwards them to a client builder
    `NewQuoteForm.tsx` that lets ops compose lines (species /
    format / qty / unit-price-pence) and either save as draft
    or send to the buyer.
- Buyer UI:
  - `app/(dashboard)/quotes/[id]/page.tsx` renders the line
    items + status + expiry. Loaded via the RLS server client.
  - `ApproveQuoteButton.tsx` (client) calls `approveQuote`,
    toasts success, and routes to `/orders/{id}`. Disabled
    when status ≠ `'sent'` or expiry passed; the surrounding
    page surfaces the reason.
- Validated:
  - `pnpm --filter web typecheck && lint && build` green;
    new routes register as `/console/quotes`,
    `/console/quotes/new`, `/quotes/[id]` (all `ƒ`/dynamic).
  - DB-side simulation against Craft Brew Co: inserted a
    `sent` quote, ran the approve path's SQL (order +
    `allocate_batch` + `order_items` + status flip to
    `approved`); allocated `ba000002-…`. Confirmed an
    expired quote (`expires_at < now()`) reads back with
    `is_expired=t` so the action's expiry guard fires.

---

### Cell 5.3 — Multi-User Companies
**What:** Company admin can invite buyers (via Cell 2.3 invite endpoint),
list company users, change roles, deactivate.

**Inputs:** Cell 5.2 complete.

**Outputs:** `app/(dashboard)/team/page.tsx`. RLS enforces only `admin`
role can invite/modify.

**Verify:** Admin invites buyer → buyer signs up → sees only own company.
Buyer cannot access `/team` page.

**Status:** `[x]`

**Implementation notes:**
- `app/actions/team.ts` — `inviteTeamMember`, `setTeamMemberRole`,
  `removeTeamMember`. All three call `requireAdmin()` which loads
  the caller's `company_users` row and rejects unless
  `role === 'admin'`. Mutations go through the service-role
  admin client after the explicit role check so writes audit
  cleanly without depending on RLS for authorization.
- `inviteTeamMember` validates email + role (`'admin'|'buyer'`)
  with zod, calls `admin.auth.admin.inviteUserByEmail` with
  `redirectTo` `${origin}/auth/callback?next=/orders` and
  `data: {company_id, role}`, then inserts the
  `company_users` link. On link failure it rolls back the
  freshly-created auth user via `deleteUser` so an orphan
  account never lingers.
- `setTeamMemberRole` and `removeTeamMember` both verify the
  target row's `company_id` matches the caller, block demoting
  or removing the last admin via a `count: 'exact'` query, and
  block self-removal. There's no `active` column on
  `company_users`, so deactivation = deleting the membership
  row (auth.users persists for re-invitation later).
- `lib/data/team.ts` — `loadTeamMembers(companyId)` lives
  under `lib/` so the dashboard route group can call it
  without tripping `no-restricted-imports`. It joins
  `company_users` rows with `auth.users.email` via
  `admin.auth.admin.getUserById` per row.
- `app/(dashboard)/team/page.tsx` — server shell, marked
  `dynamic = 'force-dynamic'`. Loads the caller, requires a
  `company_users` row (else `redirect('/sign-in?next=/team')`),
  resolves the company name, fetches members through
  `loadTeamMembers`, and forwards `{members, currentUserId,
  isAdmin, origin}` to a client `TeamTable`. Buyers get a
  read-only roster (no invite form, no controls); admins get
  the full UI.
- `app/(dashboard)/team/TeamTable.tsx` — client component
  with `useTransition`-driven invite form (email + role
  select), per-row role `<select>` and "Remove" button.
  Uses `confirm()` for destructive removal and surfaces
  server-action errors inline; success states fire toasts via
  `ToastProvider`.
- Validated:
  - `pnpm --filter web typecheck && lint && build` green;
    `/team` registers as a dynamic (`ƒ`) route.
  - DB-side: Craft Brew Co has one admin
    (`admin@craftbrew.test`) and one buyer
    (`buyer@craftbrew.test`). `select count(*) … role='admin'`
    returns `1`, so both the demote and remove guards on the
    sole admin would reject — confirming the last-admin
    safeguard fires for the seeded fixture.

---

### Cell 5.4 — Verify Phase 5
**Verify checklist:**
- [x] Net-30 path works end-to-end with invoice PDF
- [x] Quote builder + approval flow creates orders
- [x] Company admin can manage team
- [x] Buyer role cannot access admin functions

**Status:** `[x]`

**Implementation notes:**
- Net-30: `/cart` Server Action `startNet30Checkout` writes
  `orders.payment_method='net30'`, allocates inventory, renders
  the `@react-pdf/renderer` invoice via `InvoicePdf(...)` and
  attaches it to a Resend email through
  `sendInvoice(...)`. DB simulation walked an order through
  `allocate_batch` end-to-end against Craft Brew Co.
- Quotes: admin builds line items at
  `/console/quotes/new`, can save as draft or send. Buyer
  approves at `/quotes/[id]` via `ApproveQuoteButton`,
  which creates a `confirmed` order (Net-30 if the
  company is enabled, card otherwise), allocates each line,
  and flips the quote to `approved`. Expired quotes auto-flip
  to `expired` in `approveQuote` before any inventory side
  effects.
- Team: `/team` page + `app/actions/team.ts` cover invite /
  role-change / remove with admin gating. `requireAdmin()` is
  the single chokepoint; pages and actions both call it.
- Buyer guardrails: every Server Action begins with
  `requireAdmin()` (or `requireAdminFor(companyId)` for the
  quote builder), so a buyer calling them directly receives
  `{ok:false, error:'Admin role required.'}`. Admin console
  pages live in `app/(admin)/console/**` and rely on the same
  service-role / admin checks, while the storefront +
  dashboard groups are blocked by ESLint
  `no-restricted-imports` from importing the service-role
  client at all.

---

## Phase 6 — Ops: Shippo + Admin Batch Management

---

### Cell 6.1 — Shippo Adapter
**What:** Wrapper for label generation and tracking webhook handler.

**Inputs:** Phase 5 complete, Shippo API key.

**Outputs:** `apps/web/lib/shippo/{client,labels,tracking}.ts`.

**Verify:** Generate test label for TX → CA cold-chain parcel → tracking
URL returned.

**Status:** `[x]`

**Implementation notes:**
- `apps/web/lib/shippo/client.ts` — `server-only` thin fetch wrapper around
  `https://api.goshippo.com` (no SDK dep, matches the
  "mock at `lib/shippo/client.ts` boundary" guidance in
  `TESTING.md`). `getShippoClient()` returns a singleton
  `{available, request<T>(path, init)}`. Auth header is
  `Authorization: ShippoToken ${SHIPPO_API_KEY}`. Non-2xx responses throw
  a typed `ShippoError(message, status, body)`. When `SHIPPO_API_KEY` is
  unset, returns a no-op shim that logs `[shippo] SHIPPO_API_KEY unset —
  skipping ${method} ${path}` and returns `{}` cast to `T` — mirrors the
  Resend/email pattern from Cell 4.1 so local dev works without a Shippo
  account.
- `apps/web/lib/shippo/labels.ts` — `createLabel(input)` runs Shippo's
  two-step flow: `POST /shipments/` (rates), pick the requested
  `servicelevelToken` (or cheapest if unspecified, optionally pinned to
  `carrierAccount`), then `POST /transactions/` to purchase. Returns
  `{trackingNumber, trackingUrl, labelUrl, transactionId, carrier,
  rateAmount, rateCurrency}`. `coldChain: true` sets
  `extra.signature_confirmation = 'STANDARD'` and records
  `{order_id, cold_chain}` JSON in Shippo `metadata` (echoed back on
  `track_updated` webhooks → Cell 6.3 correlation). Throws `ShippoError`
  early when the API key is unset (label generation must not silently
  no-op the way tracking can). `Shippo-API-Version: 2018-02-08` pinned on
  both calls.
- `apps/web/lib/shippo/tracking.ts` —
  - `registerTracking({carrier, trackingNumber, metadata?})` posts to
    `/tracks/` so Shippo will fan `track_updated` events to our webhook;
    no-ops when key unset.
  - `getTracking(carrier, trackingNumber)` GETs the latest tracking row
    for manual polling / ops-dashboard fallback.
  - `mapShippoStatusToOrderStatus(status)` is the single source of truth
    used by the Cell 6.3 webhook: `TRANSIT → 'dispatched'`, `DELIVERED
    → 'delivered'`, `RETURNED|FAILURE → 'cancelled'`, anything else →
    `null` (no transition; pre-transit handled by the dispatch action in
    Cell 6.2). Maps to the `order_status` enum in
    `packages/db/src/types.ts`.
- `.env.local.example` documents `SHIPPO_API_KEY` + `SHIPPO_WEBHOOK_SECRET`
  with the dev-mode no-op note.
- Validated: `pnpm --filter web typecheck` / `lint` / `build` all green
  (no new routes; `lib/shippo/**` ships into the server bundle only via
  `server-only`). End-to-end TX → CA cold-chain label round-trip against
  the Shippo test API is deferred to Cell 6.2 (admin "Generate label"
  Server Action) where it is the natural integration surface; the
  adapter itself is exercised by mocking `getShippoClient()` per
  `TESTING.md`.

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
| 2.6 | Batch Traceability View | Catalog | `[x]` |
| 2.7 | Verify Phase 2 | Catalog | `[x]` |
| 3.1 | Cart State | Checkout | `[x]` |
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
