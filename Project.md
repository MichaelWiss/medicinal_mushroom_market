# Mycelium B2B — Project Context

## What This Project Is

A **B2B e-commerce portal for medicinal mushroom spawn, fresh fruiting bodies,
and dried extracts**, sold to craft breweries, functional food brands,
nutraceutical manufacturers, and pharma extraction labs.

This is not a generic Shopify store. The technical differentiator is **batch
traceability** — every shipped unit links to a specific production batch with
inoculation date, substrate lot, contamination check result, and yield record.
This is what justifies premium pricing to compliance-heavy buyers.

The portal is built on free-tier infrastructure end-to-end. Total monthly cost
at v1 launch: **$0**.

---

## Problem Statement

Industrial mushroom buyers need:

- **Freshness guarantees** — fresh fruiting bodies have 5–14 day shelf lives.
  A buyer purchasing on Monday needs to know the inoculation date, harvest
  date, and dispatch window before they commit.
- **Batch-level traceability** — pharma and nutraceutical buyers must produce
  Certificates of Analysis (CoA) tying their lot back to a substrate batch
  with a documented contamination check.
- **Bulk/contract pricing** — commercial buyers negotiate per-tier pricing
  (spot / agreement / OEM) plus volume breaks. Off-the-shelf B2C platforms
  hide this behind clunky workarounds.
- **Reliable cold-chain dispatch** — most species ship Monday only with
  insulated liners. The system must enforce dispatch windows so buyers cannot
  request a Friday shipment for a perishable product.
- **Subscription harvests** — repeat buyers want weekly or biweekly
  allocations from the next-available passing batch, ranked by priority tier.

Existing spawn suppliers operate on phone, email, and spreadsheets. Generic
B2B platforms (Salesforce B2B, SAP) cost more per month than a small
spawn-supplier's revenue. This project builds a purpose-fit portal that runs
on free tiers until the operator outgrows them.

---

## Target Users

**Procurement buyers** at breweries, food/supplement brands, and labs —
search the catalog by species and format, see live freshness and stock,
place spot orders or set up recurring subscriptions.

**Company admins** — manage their own company's users, see all orders placed
by their team, manage subscriptions and net-30 terms.

**Production team** (role: `admin` on the supplier side) — record new
batches, log contamination checks, upload CoAs, manage the dispatch queue.

---

## Core Features

### P0 — The Spine

1. **Species catalog** — Browseable list with substrate type, shelf life,
   cold-chain requirement, dispatch window, datasheet link.
2. **Freshness indicator** — On every species and batch card: days since
   inoculation, days remaining of shelf life, color-coded.
3. **Batch traceability view** — Per-order page showing each line's batch
   ID, inoculation date, substrate lot, contamination check result, harvest
   date, CoA PDF link.
4. **Company isolation** — RLS-enforced. Company A users can never see
   Company B's orders, subscriptions, quotes, or pricing.

### P1 — Order Lifecycle

5. **Cart & checkout** — Stripe Checkout Session. Server Action validates
   stock and dispatch window before creating the order.
6. **Race-safe batch allocation** — Atomic Postgres function picks the
   oldest passing batch with sufficient stock. Concurrent orders cannot
   over-allocate.
7. **Order tracking** — Live status via Supabase Realtime: pending →
   confirmed → picking → dispatched → delivered.
8. **Dispatch window enforcement** — Buyer cannot select a Friday dispatch
   for a `dispatch_window = ['MON']` species.

### P2 — Subscriptions & Accounts

9. **Weekly subscription engine** — Monday 06:00 UTC cron. Iterates active
   subscriptions in priority order, allocates the best available batch,
   creates the order, advances `next_dispatch`.
10. **Backorder handling** — If no batch passes for a subscription, send a
    Resend email and skip without breaking the queue.
11. **Tier pricing** — `spot` / `agreement` / `OEM` base discounts plus
    volume breaks, capped at 35%.
12. **Net-30** — DB-trigger-enforced: only companies with `net30_enabled =
    true` can place net-30 orders.
13. **Quotes** — Sales-built quotes with buyer-facing approve link, convert
    to order on approval.

### P3 — Ops & Polish

14. **Shippo labels** — Auto-generate insulated-liner shipping labels on
    `confirmed → picking`. Webhook updates tracking number and status.
15. **CoA upload** — Production team uploads PDF to Supabase Storage; signed
    URL gated by buyer's ownership of an order containing that batch.
16. **Admin batch entry** — Production team UI for new batches, contamination
    check workflow, yield log.
17. **PostHog events** — `catalog_view`, `add_to_cart`, `checkout_complete`,
    `subscription_created`, `batch_allocated`.
18. **Resend templates** — Order confirmation, dispatch notice, backorder,
    CoA-ready.

---

## Technology Decisions & Rationale

| Decision | Choice | Alternative Considered | Why This One |
|---|---|---|---|
| **Language** | TypeScript only | Python | One language across web, edge functions, shared logic |
| **Monorepo** | pnpm workspaces + Turborepo | Nx, Lerna | Fast installs, simple config, free Turborepo task caching |
| **Frontend** | Next.js 14 (App Router) on Vercel Hobby | Remix, SvelteKit | Free hosting, ISR for catalog, Server Actions for mutations |
| **Commerce** | Custom Next.js + Stripe Checkout | Medusa.js | Medusa adds a Railway service for <50 SKUs and no buyer-facing storefront need it offers. Defer to Phase 5 if commerce features outgrow custom. |
| **Database / Auth / Realtime / Storage / Cron** | Supabase Free | Neon + Clerk + separate cron | One platform, generous free tier, RLS native |
| **ERP / Inventory** | Supabase tables (defer ERPNext) | ERPNext on Railway | ERPNext v15 needs ~2GB RAM; Railway free is 512MB. Add only if production ops outgrow Supabase. |
| **WMS** | `batches.storage_zone` text field (drop Boxwise) | Boxwise on Docker | Boxwise has no humidity / cold-chain features — net loss vs. a typed column |
| **Search** | Postgres `pg_trgm` + FTS in Phase 1; Typesense (Fly.io free) only when catalog > 100 species | Algolia, Elasticsearch | Avoid second service while catalog is small |
| **Payments** | Stripe (no monthly fee) | Braintree, Adyen | Best free B2B payment tooling; webhook signature verification baked in |
| **Shipping** | Shippo free (10k labels/mo) | EasyPost, ShipStation | Multi-carrier, simple label API, generous free tier |
| **Email** | Resend free (3k/mo) | SendGrid, Postmark | Clean SDK, React Email templates |
| **Analytics** | PostHog Cloud free (1M events/mo) | Mixpanel, Amplitude | Open source, feature flags + recordings included |
| **Errors** | Sentry free + Vercel logs | Datadog | Free tier covers v1 volume |

### What We Explicitly Deferred

- **Medusa.js** — Adds a Railway service we don't need until commerce features (subscriptions billing UX, complex carts) outgrow custom Next.js.
- **ERPNext** — Add when multi-warehouse, supplier POs, or BOMs become real workflows. Until then, Supabase tables cover production scheduling.
- **Boxwise / dedicated WMS** — `batches.storage_zone` is sufficient for a single cold-chain warehouse.
- **Typesense** — Postgres FTS handles <100 species easily.
- **Multi-currency / multi-warehouse / ACH** — USD, single warehouse, card + net-30 only at v1.
- **Mobile native** — Responsive web is sufficient.
- **Lineage Logistics 3PL** — Cold-chain bulk storage is a separate procurement decision; the portal stays carrier-agnostic.

---

## Domain Model Relationships

```
Species ──────────────── Batch ─────────────── OrderItem ───── Order
(common_name,           (inoculation_date,      (quantity,      (status,
 latin_name,             substrate_lot,           unit_price,     dispatch_date,
 substrate_type,         contamination_check,     format,         payment_method,
 shelf_life_days,        yield_kg,                allocated_at)   total_price)
 cold_chain_required,    available_units,
 dispatch_window[],      storage_zone,
 datasheet_url)          coa_url)
                                                                       │
Company ─────────────── Subscription ────────────────────── (linked via
(name, tier,            (species_id, format,                 subscription_id)
 contact_email,          quantity, frequency,
 shipping_address,       priority_tier,
 net30_enabled)          next_dispatch)
   │
   └──── CompanyUser (role: buyer/admin, user_id → auth.users)
   └──── Quote (line_items jsonb, status, expires_at)
```

---

## Database Schema (8 Tables)

| Table | Key Columns | Notes |
|---|---|---|
| `companies` | `id`, `name`, `tier`, `net30_enabled`, `stripe_customer_id` | Buyer organizations |
| `company_users` | `company_id`, `user_id`, `role` | Extends `auth.users`. Roles: buyer / admin |
| `species` | `id`, `common_name`, `latin_name`, `substrate_type`, `shelf_life_days`, `dispatch_window text[]`, `cold_chain_required` | Catalog. Dispatch window is array, not CSV. |
| `batches` | `id`, `species_id`, `inoculation_date`, `substrate_lot`, `contamination_check`, `available_units`, `storage_zone`, `coa_url` | Traceability core. Race-safe allocation via `allocate_batch()` function. |
| `orders` | `id`, `company_id`, `status`, `payment_method`, `dispatch_date`, `total_price`, `tracking_number` | Net-30 trigger enforces `companies.net30_enabled` |
| `order_items` | `order_id`, `species_id`, `batch_id`, `format`, `quantity`, `unit_price`, `allocated_at` | `batch_id` set atomically by `allocate_batch()` |
| `subscriptions` | `company_id`, `species_id`, `format`, `frequency`, `priority_tier`, `next_dispatch`, `stripe_sub_id` | Lower `priority_tier` = higher priority |
| `quotes` | `company_id`, `line_items jsonb`, `status`, `total_price`, `expires_at` | Validated against Zod schema before insert |

**RLS pattern:**
- `species`, `batches` (where `contamination_check = 'pass'`) — readable by any authenticated user.
- `companies`, `orders`, `order_items`, `subscriptions`, `quotes` — scoped via `auth.jwt() ->> 'company_id'` (custom JWT claim, not subquery).
- Production-team admin role bypasses via service-role key in admin route group.
- Realtime enabled on: `orders`, `batches`.

---

## State Machines

### Order Status

```
pending ──▶ confirmed ──▶ picking ──▶ dispatched ──▶ delivered
   │             │             │
   └─────────────┴─────────────┴──────▶ cancelled
```

| Status | Meaning |
|---|---|
| `pending` | Created, awaiting Stripe webhook |
| `confirmed` | Payment confirmed, batch allocated |
| `picking` | Warehouse picking from `storage_zone` |
| `dispatched` | Shippo label generated, in transit |
| `delivered` | Carrier confirmed delivery |
| `cancelled` | Cancelled before dispatch |

### Batch Contamination Check

```
pending ──▶ pass ──▶ (allocatable)
   │
   └──▶ fail ──▶ (excluded from allocation forever)
```

---

## Pricing Logic

```
Total discount = tier discount + volume break  (capped at 35%)

Tier discounts:
  spot       0%
  agreement 10%
  oem       22%

Volume breaks (per company, configurable):
  qty ≥  10  → +2%
  qty ≥  50  → +5%
  qty ≥ 100  → +8%

unit_price = round(basePrice × (1 − totalDiscount))
line_total = unit_price × quantity
```

Implemented in `packages/shared/pricing.ts` — pure functions, fully unit-tested. All monetary values stored as `numeric(10,2)` in Postgres; computed in cents in TypeScript to avoid float drift.

---

## Data Flows

### Buyer-Initiated

| Trigger | Flow | Result |
|---|---|---|
| Browse catalog | Browser → Next.js (ISR) → Supabase | Species cards with freshness indicator |
| Search | Browser → Postgres FTS | Ranked species results |
| Add to cart | Browser → Zustand store → localStorage / Supabase `carts` | Cart persisted across sessions |
| Checkout | Server Action → validate stock + dispatch window → create `pending` order → Stripe Checkout Session | Stripe hosted checkout opens |
| Stripe webhook | Stripe → `/api/webhooks/stripe` → `allocate_batch()` per line → order `confirmed` | Batch units atomically decremented |
| Track order | Browser ← Supabase Realtime channel | Live status, tracking number when available |

### Scheduled

| Schedule | Edge Function | Source → Target |
|---|---|---|
| Mondays 06:00 UTC | `subscription-engine` | `subscriptions` → `orders` (priority order, FIFO batch) |
| On Stripe event | `/api/webhooks/stripe` | `payment_intent.succeeded` → order `confirmed` |
| On Shippo event | `/api/webhooks/shippo` | tracking update → `orders.tracking_number`, status |

---

## Environment Variables

| Variable | Service | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Public browser client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Public browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Server-side only — bypasses RLS |
| `STRIPE_SECRET_KEY` | Stripe | Server-side |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe | Public browser key |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Webhook signature verification |
| `SHIPPO_API_KEY` | Shippo | Label & tracking API |
| `RESEND_API_KEY` | Resend | Transactional email |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog | Browser analytics |
| `POSTHOG_API_KEY` | PostHog | Server-side analytics |
| `SENTRY_DSN` | Sentry | Error reporting |

Deferred (added with their phases):
| `TYPESENSE_HOST`, `TYPESENSE_API_KEY`, `NEXT_PUBLIC_TYPESENSE_SEARCH_KEY` | Typesense | Phase 5 only |
| `ERPNEXT_URL`, `ERPNEXT_API_KEY`, `ERPNEXT_API_SECRET` | ERPNext | Phase 5 only |

---

## Free-Tier Ceilings

| Service | Limit | Headroom |
|---|---|---|
| Vercel Hobby | 100 GB bandwidth/mo | ~50k catalog views/mo |
| Supabase Free | 500 MB DB, 2 GB storage, 50k MAU | ~10k orders, ~2k CoA PDFs |
| Resend | 3k emails/mo | ~500 orders + alerts |
| Shippo | 10k labels/mo | Far above v1 volume |
| PostHog Cloud | 1M events/mo | ~50k catalog visits at 20 events each |
| Stripe | No monthly fee | Pay-per-transaction only |

All limits comfortably above expected first-year volume. The natural upgrade path is Supabase Pro ($25/mo) when DB approaches 500 MB.

---

## Non-Goals (Out of Scope for v1)

- Public unauthenticated catalog (auth required to see prices, but species names are public for SEO)
- Consumer-facing storefront (B2B only, no guest checkout)
- Mobile native app
- Multi-tenant SaaS (single deployment per supplier)
- Multi-currency, multi-warehouse, ACH payments
- Real-time temperature monitoring of in-transit shipments
- Auto-generated CoAs (manual upload only at v1)
- ML-driven yield forecasting
- Public API for third-party integrations
