// =============================================================
// pricing.test.ts — covers tier × volume combinations,
// 35% cap, rounding, input validation.
// =============================================================

import { describe, it, expect } from 'vitest';
import {
  calculateLinePrice,
  calculateOrderTotal,
  calculateTotalDiscount,
  getTierDiscount,
  getVolumeDiscount,
} from '../pricing.js';

// ── getTierDiscount ───────────────────────────────────────────

describe('getTierDiscount', () => {
  it('returns 0 for spot', () => {
    expect(getTierDiscount('spot')).toBe(0);
  });
  it('returns 0.10 for agreement', () => {
    expect(getTierDiscount('agreement')).toBe(0.10);
  });
  it('returns 0.22 for oem', () => {
    expect(getTierDiscount('oem')).toBe(0.22);
  });
});

// ── getVolumeDiscount ─────────────────────────────────────────

describe('getVolumeDiscount', () => {
  it.each([
    [0,    0.00],
    [1,    0.00],
    [9,    0.00],
    [10,   0.03],
    [49,   0.03],
    [50,   0.05],
    [99,   0.05],
    [100,  0.08],
    [499,  0.08],
    [500,  0.13],
    [9999, 0.13],
  ])('quantity %i → %f', (qty, expected) => {
    expect(getVolumeDiscount(qty)).toBe(expected);
  });
});

// ── calculateTotalDiscount ────────────────────────────────────

describe('calculateTotalDiscount', () => {
  it('sums tier + volume below cap', () => {
    // oem 22% + 100-units 8% = 30%
    expect(calculateTotalDiscount('oem', 100)).toBeCloseTo(0.30);
  });

  it('caps total at 35%', () => {
    // oem 22% + 500-units 13% = 35% (right at cap)
    expect(calculateTotalDiscount('oem', 500)).toBe(0.35);
    // hypothetical 50% combined would still be 35%
    expect(calculateTotalDiscount('oem', 9999)).toBe(0.35);
  });

  it('returns 0 for spot tier with low qty', () => {
    expect(calculateTotalDiscount('spot', 1)).toBe(0);
  });
});

// ── calculateLinePrice ────────────────────────────────────────

describe('calculateLinePrice', () => {
  it('applies tier discount only when below volume break threshold', () => {
    // 2500 × 5 × (1 − 0.10) = 11250
    expect(calculateLinePrice(2500, 5, 'agreement')).toBe(11250);
  });

  it('applies no discount for spot tier under volume threshold', () => {
    expect(calculateLinePrice(2500, 5, 'spot')).toBe(12500);
  });

  it('stacks tier + volume break under the cap', () => {
    // oem 22% + 100-units 8% = 30%
    // 2500 × 100 × 0.70 = 175000
    expect(calculateLinePrice(2500, 100, 'oem')).toBe(175000);
  });

  it('caps total discount at 35%', () => {
    // oem 22% + 500-units 13% = 35% (capped, not 35.0001)
    // 1000 × 500 × 0.65 = 325000
    expect(calculateLinePrice(1000, 500, 'oem')).toBe(325000);
  });

  it('rounds to nearest integer cent', () => {
    // 333 × 7 × (1 − 0.10) = 2097.9 → 2098
    expect(calculateLinePrice(333, 7, 'agreement')).toBe(2098);
  });

  it('handles volume-break boundary at exactly 10', () => {
    // spot 0% + 10-units 3% = 3%
    // 1000 × 10 × 0.97 = 9700
    expect(calculateLinePrice(1000, 10, 'spot')).toBe(9700);
  });

  it('handles volume-break boundary at exactly 9 (no break)', () => {
    expect(calculateLinePrice(1000, 9, 'spot')).toBe(9000);
  });

  it('rejects non-integer unitPrice', () => {
    expect(() => calculateLinePrice(99.5, 1, 'spot')).toThrow();
  });

  it('rejects negative unitPrice', () => {
    expect(() => calculateLinePrice(-1, 1, 'spot')).toThrow();
  });

  it('rejects zero quantity', () => {
    expect(() => calculateLinePrice(100, 0, 'spot')).toThrow();
  });

  it('rejects negative quantity', () => {
    expect(() => calculateLinePrice(100, -5, 'spot')).toThrow();
  });
});

// ── calculateOrderTotal ───────────────────────────────────────

describe('calculateOrderTotal', () => {
  it('sums independent line prices', () => {
    const total = calculateOrderTotal(
      [
        { unitPrice: 2500, quantity: 5 },   // 11250 @ agreement
        { unitPrice: 1000, quantity: 10 },  // 1000*10*(1-0.13) = 8700
      ],
      'agreement',
    );
    expect(total).toBe(11250 + 8700);
  });

  it('volume breaks do not aggregate across lines', () => {
    // Two separate 5-unit lines should NOT combine into a 10-unit break.
    const total = calculateOrderTotal(
      [
        { unitPrice: 1000, quantity: 5 },
        { unitPrice: 1000, quantity: 5 },
      ],
      'spot',
    );
    expect(total).toBe(10000); // no discount
  });

  it('returns 0 for empty lines', () => {
    expect(calculateOrderTotal([], 'agreement')).toBe(0);
  });
});
