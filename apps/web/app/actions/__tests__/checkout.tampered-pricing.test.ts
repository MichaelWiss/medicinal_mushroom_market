// Integration test for `startCheckout` (security plan step 5).
//
// Verifies the property: a tampered cart payload (client-supplied
// `unitPrice` and `speciesName`) cannot influence what the server sends
// to Stripe or writes to `orders` / `order_items`.
//
// Strategy:
//   • Stub `@/lib/supabase/server` so the action gets our chainable mock.
//   • Stub `@/lib/stripe/server` to capture the exact payload passed to
//     `checkout.sessions.create`.
//   • Stub `@/lib/posthog/track`, `next/cache`, `next/headers`.
//   • Submit a cart with `unitPrice: 1` (1p) and `speciesName: 'fake'`.
//   • Assert Stripe receives the trusted unit_amount (in pence) and the
//     trusted species name; assert `order_items` insert receives the
//     trusted unit_price; assert `orders.total_price` matches the
//     trusted total.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { calculateLinePrice } from '@repo/shared';
import { PRESENTATION_BY_LATIN } from '@/lib/data/species-presentation';
import { createSupabaseMock } from './_supabase-mock';

// ── Module-level stubs ───────────────────────────────────────────
//
// `vi.mock` calls are hoisted to the top of the file, so we use module
// state plus a per-test `setSupabase` setter to feed canned responses.

let supabaseMock: ReturnType<typeof createSupabaseMock> | null = null;
const stripeSessionsCreate = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabaseMock!.client,
}));

vi.mock('@/lib/stripe/server', () => ({
  getStripe: () => ({
    checkout: { sessions: { create: stripeSessionsCreate } },
  }),
}));

vi.mock('@/lib/posthog/track', () => ({
  track: vi.fn(),
  flushPostHog: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('next/headers', () => ({
  // checkout uses `headers()` only via the dynamic import inside
  // `resolveOrigin`; returning a Map-like satisfies its `.get()` usage.
  headers: async () => ({
    get: (_key: string) => null,
  }),
}));

// Import AFTER mocks are registered (vitest hoists vi.mock above imports
// but we re-affirm the order with a top-level await).
const { startCheckout } = await import('@/app/actions/checkout');

const LIONS_MANE_LATIN = 'Hericium erinaceus';
// Strict RFC-compliant UUID v4 — Zod v4 `.uuid()` rejects the loose
// hex-literal IDs used in supabase/seed.sql.
const LIONS_MANE_ID = '11111111-1111-4111-8111-111111111111';
const LIONS_MANE_TRUSTED_PENCE = Math.round(
  PRESENTATION_BY_LATIN[LIONS_MANE_LATIN]!.price * 100,
);

beforeEach(() => {
  stripeSessionsCreate.mockReset();
  stripeSessionsCreate.mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://stripe.test/checkout/cs_test_123',
  });
});

describe('startCheckout — tampered pricing', () => {
  it('ignores client unitPrice and speciesName, uses trusted values', async () => {
    supabaseMock = createSupabaseMock({
      authUser: { id: 'u-1', email: 'admin@craftbrew.test' },
      byTableOp: {
        'company_users:select': {
          data: { company_id: 'c-1', companies: { id: 'c-1', tier: 'spot' } },
          error: null,
        },
        'species:select': {
          data: [
            {
              id: LIONS_MANE_ID,
              common_name: "Lion's Mane",
              latin_name: LIONS_MANE_LATIN,
              dispatch_window: ['MON'],
            },
          ],
          error: null,
        },
        'batches:select': {
          data: [
            {
              species_id: LIONS_MANE_ID,
              available_units: 100,
              contamination_check: 'pass',
            },
          ],
          error: null,
        },
        'orders:insert': { data: { id: 'o-1' }, error: null },
        'order_items:insert': { data: null, error: null },
        'orders:update': { data: null, error: null },
      },
    });

    const QUANTITY = 3;
    // Pick any Monday so isDispatchAllowed passes for the seeded species.
    const dispatchDate = nextMondayISO();

    const result = await startCheckout({
      items: [
        {
          speciesId: LIONS_MANE_ID,
          speciesName: 'TAMPERED_NAME',
          format: 'fresh',
          unitPrice: 1, // 1 penny — would let an attacker check out for ~free
          quantity: QUANTITY,
        },
      ],
      dispatchDate,
    });

    expect(result).toEqual({
      ok: true,
      url: 'https://stripe.test/checkout/cs_test_123',
      orderId: 'o-1',
    });

    // 1) Stripe was called exactly once.
    expect(stripeSessionsCreate).toHaveBeenCalledTimes(1);
    const stripePayload = stripeSessionsCreate.mock.calls[0]![0] as {
      line_items: Array<{
        quantity: number;
        price_data: { unit_amount: number; product_data: { name: string } };
      }>;
    };

    // 2) Stripe got the trusted unit_amount, NOT the tampered 1p.
    expect(stripePayload.line_items).toHaveLength(1);
    const line = stripePayload.line_items[0]!;
    // tier='spot' applies 0% discount, so the trusted unit_amount equals
    // the per-unit list price in pence.
    expect(line.price_data.unit_amount).toBe(LIONS_MANE_TRUSTED_PENCE);
    expect(line.quantity).toBe(QUANTITY);
    // Stripe's product name uses the DB common_name, not the tampered string.
    expect(line.price_data.product_data.name).toContain("Lion's Mane");
    expect(line.price_data.product_data.name).not.toContain('TAMPERED_NAME');

    // 3) The persisted order's total_price matches the trusted total.
    const orderInsert = supabaseMock!.lastPayload['orders:insert'] as {
      total_price: number;
      status: string;
      payment_method: string;
    };
    expect(orderInsert.total_price).toBe(LIONS_MANE_TRUSTED_PENCE * QUANTITY);
    expect(orderInsert.status).toBe('pending');
    expect(orderInsert.payment_method).toBe('card');

    // 4) order_items.unit_price uses the trusted price (after running it
    //    through the discount engine — which for spot+qty=3 is a no-op).
    const itemsInsert = supabaseMock!.lastPayload['order_items:insert'] as Array<{
      species_id: string;
      unit_price: number;
      quantity: number;
    }>;
    expect(itemsInsert).toHaveLength(1);
    expect(itemsInsert[0]!.species_id).toBe(LIONS_MANE_ID);
    expect(itemsInsert[0]!.quantity).toBe(QUANTITY);
    const expectedDiscountedUnit = Math.round(
      calculateLinePrice(LIONS_MANE_TRUSTED_PENCE, QUANTITY, 'spot') / QUANTITY,
    );
    expect(itemsInsert[0]!.unit_price).toBe(expectedDiscountedUnit);
    // And specifically: NOT the tampered 1p.
    expect(itemsInsert[0]!.unit_price).not.toBe(1);
  });

  it('rejects a cart line whose format is not offered for the species', async () => {
    supabaseMock = createSupabaseMock({
      authUser: { id: 'u-1', email: 'admin@craftbrew.test' },
      byTableOp: {
        'company_users:select': {
          data: { company_id: 'c-1', companies: { id: 'c-1', tier: 'spot' } },
          error: null,
        },
        'species:select': {
          data: [
            {
              id: LIONS_MANE_ID,
              common_name: "Lion's Mane",
              latin_name: LIONS_MANE_LATIN,
              dispatch_window: ['MON'],
            },
          ],
          error: null,
        },
        'batches:select': {
          data: [
            {
              species_id: LIONS_MANE_ID,
              available_units: 100,
              contamination_check: 'pass',
            },
          ],
          error: null,
        },
      },
    });

    // Lion's Mane is offered in fresh/spawn/culture, NOT powder.
    const result = await startCheckout({
      items: [
        {
          speciesId: LIONS_MANE_ID,
          speciesName: "Lion's Mane",
          format: 'powder',
          unitPrice: 1,
          quantity: 1,
        },
      ],
      dispatchDate: nextMondayISO(),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid_input');
    expect(stripeSessionsCreate).not.toHaveBeenCalled();
  });
});

// ── helpers ───────────────────────────────────────────────────────

/** Returns the next Monday (or today if today is Monday) as YYYY-MM-DD UTC. */
function nextMondayISO(): string {
  const d = new Date();
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const delta = (1 - dow + 7) % 7; // days until Monday
  const out = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + delta),
  );
  return out.toISOString().slice(0, 10);
}
