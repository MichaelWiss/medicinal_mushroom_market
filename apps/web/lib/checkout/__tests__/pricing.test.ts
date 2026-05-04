// Unit tests for `resolveTrustedLine` (security plan step 5).
//
// These tests lock in the contract that the helper:
//   • derives unitPricePence from the canonical PRESENTATION_BY_LATIN map,
//   • exposes no surface for the client to influence the price (the
//     function intentionally does not accept a `unitPrice` parameter),
//   • rejects unknown species and disallowed formats with explicit codes,
//   • passes through the server-resolved `common_name` so consumers do
//     not have to trust the cart's `speciesName`.

import { describe, expect, it } from 'vitest';
import { resolveTrustedLine } from '@/lib/checkout/pricing';
import { PRESENTATION_BY_LATIN } from '@/lib/data/species-presentation';

const LIONS_MANE_LATIN = "Hericium erinaceus";
const REISHI_LATIN = "Ganoderma lucidum";

const lionsManeRow = {
  id: '5e000001-0000-0000-0000-000000000001',
  common_name: "Lion's Mane",
  latin_name: LIONS_MANE_LATIN,
};

const reishiRow = {
  id: '5e000009-0000-0000-0000-000000000001',
  common_name: 'Reishi',
  latin_name: REISHI_LATIN,
};

describe('resolveTrustedLine', () => {
  it('returns the canonical price (in pence) for a seeded species/format', () => {
    const result = resolveTrustedLine(lionsManeRow, 'fresh', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expectedPence = Math.round(
      PRESENTATION_BY_LATIN[LIONS_MANE_LATIN]!.price * 100,
    );
    expect(result.line.unitPricePence).toBe(expectedPence);
  });

  it('uses the server-side common_name, not any client value', () => {
    // The helper has no way to receive a client speciesName — this test
    // documents that the returned `speciesName` is sourced from the DB
    // row passed in, and is what downstream consumers must use.
    const result = resolveTrustedLine(
      { ...lionsManeRow, common_name: 'Lion\u2019s Mane' },
      'fresh',
      3,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line.speciesName).toBe('Lion\u2019s Mane');
  });

  it('forwards quantity and format unchanged', () => {
    const result = resolveTrustedLine(reishiRow, 'powder', 7);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line.quantity).toBe(7);
    expect(result.line.format).toBe('powder');
    expect(result.line.speciesId).toBe(reishiRow.id);
  });

  it('rejects an unknown species with code "unknown_species"', () => {
    const result = resolveTrustedLine(
      { id: 'x', common_name: 'Unknown', latin_name: 'Bogus genus' },
      'fresh',
      1,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unknown_species');
  });

  it('rejects a format the species does not offer with code "unknown_format"', () => {
    // Lion's Mane offers fresh/spawn/culture but not powder.
    expect(
      PRESENTATION_BY_LATIN[LIONS_MANE_LATIN]!.formats.includes('powder'),
    ).toBe(false);
    const result = resolveTrustedLine(lionsManeRow, 'powder', 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unknown_format');
  });

  it('returns the same price for the same (species, format) regardless of quantity', () => {
    // Tier + volume discounts are layered on top of the per-unit price by
    // the pricing engine, not by this helper. The helper must always
    // return the list price.
    const a = resolveTrustedLine(lionsManeRow, 'fresh', 1);
    const b = resolveTrustedLine(lionsManeRow, 'fresh', 1000);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.line.unitPricePence).toBe(b.line.unitPricePence);
  });
});
