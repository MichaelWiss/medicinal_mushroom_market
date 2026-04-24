# Mycelium B2B — Testing Strategy

## Testing Pyramid

```
                    ▲
                   / \
                  /E2E\               10%   Playwright
                 /─────\
                /       \
               /Integration\          20%   Vitest + Supabase local
              /─────────────\
             /               \
            /     Unit        \       70%   Vitest
           /───────────────────\
```

---

## Unit Tests (70%)

**Tools**: Vitest
**Location**: `*.test.ts` colocated with source (pattern:
`packages/**/*.test.ts`, `apps/**/lib/**/*.test.ts`)
**Run**: `pnpm test`
**Coverage Target**: 80% for `packages/shared/**` and `apps/web/lib/**`

**What to test:**
- Pricing engine — every tier × volume combination, 35% cap, rounding
- Freshness helpers — boundary at exactly `shelf_life_days`, day before/after
- State-machine guards — every valid and invalid transition
- Zod schemas — accepts valid input, rejects malformed
- Pure data transforms (Stripe line items → DB rows, etc.)

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { calculateLinePrice } from './pricing';

describe('calculateLinePrice', () => {
  it('applies tier discount only when below volume break threshold', () => {
    expect(calculateLinePrice(2500, 5, 'agreement')).toBe(11250);
    // 2500 × 5 × (1 − 0.10) = 11250
  });

  it('stacks tier + volume break, capped at 35%', () => {
    expect(calculateLinePrice(2500, 100, 'oem')).toBe(
      Math.round(2500 * 100 * (1 - 0.30))
    );
    // 22% tier + 8% volume = 30% (under cap)
  });

  it('caps total discount at 35%', () => {
    expect(calculateLinePrice(1000, 100, 'oem')).toBeGreaterThan(
      Math.round(1000 * 100 * 0.65)
    );
  });
});
```

---

## Integration Tests (20%)

**Tools**: Vitest + local Supabase stack + Stripe CLI replay
**Location**: `packages/db/__tests__/`, `apps/web/app/**/*.integration.test.ts`
**Run**: `pnpm test:integration` (starts Supabase locally first)

**What to test:**
- **Race-safe allocation** — 50 concurrent `allocate_batch` calls against a
  10-unit batch; assert exactly 10 succeed, 40 return null, units = 0.
- **RLS policies** — Company A's JWT cannot read Company B's orders, even
  with crafted SQL via PostgREST.
- **Net-30 trigger** — direct insert with `payment_method='net30'` for a
  company with `net30_enabled=false` raises an exception.
- **CoA Storage RLS** — buyer of an order containing batch X can sign and
  download `coa/x.pdf`; buyer without such an order gets 403.
- **Subscription engine** — seed N due subscriptions with mixed
  fulfillability; invoke function; assert orders created in priority order,
  backorder rows correct.
- **Stripe webhook** — `stripe trigger checkout.session.completed` against
  a pending order; assert order transitions and batch atomically decrements.
- **Dispatch window validator** (Server Action) — Friday dispatch for a
  Mon-only species rejects.

**Example — race test:**
```typescript
it('never over-allocates under concurrency', async () => {
  await seedBatch({ available_units: 10 });
  const results = await Promise.all(
    Array.from({ length: 50 }, () =>
      supabase.rpc('allocate_batch', { p_species_id, p_qty: 1 })
    )
  );
  const succeeded = results.filter(r => r.data !== null).length;
  expect(succeeded).toBe(10);

  const { data: batch } = await supabase
    .from('batches').select('available_units').eq('id', batchId).single();
  expect(batch.available_units).toBe(0);
});
```

---

## E2E Tests (10%)

**Tools**: Playwright
**Location**: `e2e/`
**Run**: `pnpm test:e2e`

**What to test (critical paths only):**
- Magic-link sign-in → catalog → species detail → add to cart → checkout
  with Stripe test card `4242 4242 4242 4242` → order appears in dashboard
  with linked batch and CoA download link.
- Subscription creation → manual cron trigger → order appears.
- Net-30 buyer sees net-30 option; spot buyer does not.
- Quote approval flow: admin creates quote → buyer receives email link →
  approves → order appears.

**Anti-pattern**: Do **not** E2E-test pricing math, RLS, or webhooks.
Those belong in unit and integration tests where they run fast and
deterministically. E2E tests cover only flows that span the full stack
end-to-end.

---

## Running Tests

```bash
# All unit tests, watch mode
pnpm test

# Single CI-style run
pnpm test:run

# Coverage report
pnpm test:coverage

# Integration suite (boots local Supabase)
pnpm test:integration

# E2E suite (requires app running on :3000)
pnpm dev &
pnpm test:e2e
```

### In CI

GitHub Actions on every PR and push to `main`:
1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test:run` (unit only, fast)
5. `supabase start` then `pnpm test:integration`
6. `pnpm build`

E2E runs nightly only, against a Vercel preview deployment.

---

## Test Data

**Fixtures**: `packages/db/seed.sql` is the canonical fixture. Integration
tests call `supabase db reset` to a known state before each suite.

**Factories**: For unit tests, prefer hand-written deterministic builders in
`packages/shared/src/__tests__/fixtures.ts`. Add `@faker-js/faker` only when
randomized fixtures genuinely improve a test (rare — most tests want
deterministic inputs).

**Database**: Integration tests use the local Supabase stack (`supabase
start`). CI provisions a fresh Postgres container per job.

---

## Mocking Strategy

- **Stripe** — Use the Stripe CLI in fixture mode for webhook tests; mock
  the SDK in unit tests via `vi.mock('stripe')`.
- **Shippo** — Mock at the `lib/shippo/client.ts` boundary in unit and
  integration tests. Real API only in E2E nightly.
- **Resend** — Mock `send` in tests; assert it was called with expected
  template and recipient.
- **Supabase client** — In unit tests, mock the client. In integration
  tests, hit the real local stack (no mocking).
- **Time** — `vi.useFakeTimers()` for cron and freshness tests so
  `new Date()` is deterministic.
- **PostHog / Sentry** — No-op in test environment via env-based switch in
  the client wrapper.

---

## Coverage Requirements

| Scope | Minimum | Critical-path target |
|---|---|---|
| `packages/shared/**` | 80% | 95% |
| `apps/web/lib/**` | 80% | 95% |
| Critical paths: `allocate_batch`, Stripe webhook, RLS policies, net-30 trigger | — | 100% behavior coverage via integration tests |
| New code in PRs | 90% | — |

**Excluded from coverage measurement**: React components, page files,
generated DB types, Supabase config files. We measure coverage where bugs
have real consequences — pricing, allocation, state transitions, security.

---

## Performance Testing

**Tool**: k6 (Phase 7+)
**Location**: `tests/performance/`
**Run**: `pnpm test:performance`

**Scenarios:**
- **Catalog load** — 100 concurrent users browsing for 60s; p95 TTFB < 500ms.
- **Allocation under load** — 50 concurrent checkout sessions for the same
  high-demand batch; assert no over-allocation, p95 webhook processing
  < 2s.
- **Subscription cron** — simulate 1000 active subscriptions; cron must
  complete in < 60s to stay within free-tier execution limits.

---

## Security Testing

- **Dependency scanning**: `pnpm audit` in CI; PR fails on high/critical.
- **RLS coverage**: Integration test enumerates every table and asserts
  cross-tenant reads return 0 rows with another company's JWT.
- **Webhook signatures**: Test that tampered Stripe and Shippo payloads
  return 401 without any DB writes.
- **Service-role key isolation**: ESLint custom rule fails on any import
  of `lib/supabase/admin` from `(storefront)/` or `(dashboard)/`.
- **CSP / security headers**: Integration test on `/api/health` asserts
  expected headers present.
- **Rate limiting**: Integration test fires 11 rapid requests at
  `/api/invites` from one IP, asserts 11th returns 429.

---

## Test Best Practices

- Follow AAA pattern (Arrange, Act, Assert).
- Keep tests deterministic — no real network, no real time, no random data
  in unit tests.
- Use descriptive names: `it('rejects net-30 for company without net30_enabled')`.
- One behavior per test. If a test has multiple `expect`s, they should all
  be observations of the same outcome.
- No test interdependencies — each test must run in isolation.
- Integration tests reset DB state via `supabase db reset` between suites,
  not between individual tests (too slow); use transactions where possible.
- Unit tests under 5ms each; integration under 500ms; E2E under 30s.

---

## Flaky Test Policy

- A flaky test is fixed within 48 hours or temporarily skipped with a
  GitHub issue tagged `flaky-test`.
- Root cause must be identified — never `retry()` away the symptom.
- Common causes: real time, real network, shared mutable state, unawaited
  promises. Audit for these first.
- The race-test (`allocate_batch` concurrent) must be deterministic across
  10 consecutive CI runs before merging changes that touch allocation logic.
