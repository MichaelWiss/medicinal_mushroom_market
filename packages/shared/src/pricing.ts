// =============================================================
// @repo/shared — pricing.ts
//
// Pricing engine: tier discount + volume break, capped at 35%.
//
// Tier discounts (CompanyTier):
//   spot       0%
//   agreement  10%
//   oem        22%
//
// Volume breaks (per line quantity):
//      1 –   9     0%
//     10 –  49     3%
//     50 –  99     5%
//    100 – 499     8%
//    500+         13%
//
// Total discount = tier + volume, hard-capped at 35%.
// All inputs and outputs are integer pence/cents (no fractional money).
// =============================================================

import type { CompanyTier } from './types.js';

const MAX_DISCOUNT = 0.35;

const TIER_DISCOUNT: Record<CompanyTier, number> = {
  spot:      0.00,
  agreement: 0.10,
  oem:       0.22,
};

interface VolumeBreak {
  /** Inclusive lower bound on quantity. */
  minQty:   number;
  discount: number;
}

// Sorted ascending by minQty; lookup walks until the next bracket exceeds qty.
const VOLUME_BREAKS: readonly VolumeBreak[] = [
  { minQty: 1,   discount: 0.00 },
  { minQty: 10,  discount: 0.03 },
  { minQty: 50,  discount: 0.05 },
  { minQty: 100, discount: 0.08 },
  { minQty: 500, discount: 0.13 },
];

/**
 * Returns the volume-break discount fraction for a given quantity.
 * Quantities < 1 receive 0%.
 */
export function getVolumeDiscount(quantity: number): number {
  let discount = 0;
  for (const bracket of VOLUME_BREAKS) {
    if (quantity >= bracket.minQty) discount = bracket.discount;
    else break;
  }
  return discount;
}

/**
 * Returns the tier discount fraction for a CompanyTier.
 */
export function getTierDiscount(tier: CompanyTier): number {
  return TIER_DISCOUNT[tier];
}

/**
 * Returns the combined tier + volume discount fraction, capped at 35%.
 */
export function calculateTotalDiscount(
  tier: CompanyTier,
  quantity: number,
): number {
  const combined = getTierDiscount(tier) + getVolumeDiscount(quantity);
  return Math.min(combined, MAX_DISCOUNT);
}

/**
 * Calculates the price for a single line (one species × quantity).
 *
 * @param unitPrice list price per unit, in integer pence/cents
 * @param quantity  positive integer count
 * @param tier      buyer's company tier
 * @returns total line price in integer pence/cents (rounded to nearest)
 */
export function calculateLinePrice(
  unitPrice: number,
  quantity: number,
  tier: CompanyTier,
): number {
  if (!Number.isInteger(unitPrice) || unitPrice < 0) {
    throw new Error(`unitPrice must be a non-negative integer, got ${unitPrice}`);
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`quantity must be a positive integer, got ${quantity}`);
  }

  const discount = calculateTotalDiscount(tier, quantity);
  return Math.round(unitPrice * quantity * (1 - discount));
}

interface OrderLine {
  unitPrice: number;
  quantity:  number;
}

/**
 * Sums per-line prices to produce an order subtotal in integer pence/cents.
 * Each line is priced independently (volume breaks do not aggregate
 * across different SKUs).
 */
export function calculateOrderTotal(
  lines: readonly OrderLine[],
  tier: CompanyTier,
): number {
  return lines.reduce(
    (sum, line) => sum + calculateLinePrice(line.unitPrice, line.quantity, tier),
    0,
  );
}
