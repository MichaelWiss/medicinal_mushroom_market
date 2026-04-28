/**
 * Freshness helpers for batch shelf-life calculations.
 *
 * All math is UTC-only — no timezone-dependent behavior. Inputs may be
 * `Date` objects or ISO date strings (`YYYY-MM-DD` or full ISO datetime).
 * Date-only strings are parsed as UTC midnight.
 */

export type FreshnessLabel = 'fresh' | 'aging' | 'expired';

const MS_PER_DAY = 86_400_000;

function toUtcMidnight(input: string | Date): number {
  const d = input instanceof Date ? input : parseDate(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${String(input)}`);
  }
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseDate(input: string): Date {
  // Date-only strings (YYYY-MM-DD) — parse as UTC midnight to avoid TZ drift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T00:00:00.000Z`);
  }
  return new Date(input);
}

function todayUtcMidnight(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Whole days elapsed since inoculation (UTC, floored). Future dates → negative.
 */
export function daysSinceInoculation(
  inoculationDate: string | Date,
  now: Date = new Date(),
): number {
  const start = toUtcMidnight(inoculationDate);
  const today = todayUtcMidnight(now);
  return Math.floor((today - start) / MS_PER_DAY);
}

/**
 * Whole days remaining until expiry. Expired batches return negative numbers.
 */
export function daysUntilExpiry(
  inoculationDate: string | Date,
  shelfLifeDays: number,
  now: Date = new Date(),
): number {
  if (!Number.isInteger(shelfLifeDays) || shelfLifeDays <= 0) {
    throw new Error(`shelfLifeDays must be a positive integer, got ${shelfLifeDays}`);
  }
  return shelfLifeDays - daysSinceInoculation(inoculationDate, now);
}

/**
 * Classifies batch freshness:
 * - `fresh`   — < 50% of shelf life consumed
 * - `aging`   — ≥ 50% but < 100% consumed
 * - `expired` — ≥ 100% consumed (i.e., age ≥ shelfLifeDays)
 */
export function freshnessLabel(
  inoculationDate: string | Date,
  shelfLifeDays: number,
  now: Date = new Date(),
): FreshnessLabel {
  if (!Number.isInteger(shelfLifeDays) || shelfLifeDays <= 0) {
    throw new Error(`shelfLifeDays must be a positive integer, got ${shelfLifeDays}`);
  }
  const age = daysSinceInoculation(inoculationDate, now);
  if (age >= shelfLifeDays) return 'expired';
  if (age * 2 >= shelfLifeDays) return 'aging';
  return 'fresh';
}
