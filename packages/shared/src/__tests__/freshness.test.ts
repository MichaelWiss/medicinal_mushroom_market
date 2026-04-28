import { describe, expect, it } from 'vitest';
import {
  daysSinceInoculation,
  daysUntilExpiry,
  freshnessLabel,
} from '../freshness.js';

const NOW = new Date('2026-04-27T12:34:56.000Z');

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('daysSinceInoculation', () => {
  it('returns 0 for today', () => {
    expect(daysSinceInoculation(daysAgo(0), NOW)).toBe(0);
  });

  it('returns whole days elapsed', () => {
    expect(daysSinceInoculation(daysAgo(1), NOW)).toBe(1);
    expect(daysSinceInoculation(daysAgo(30), NOW)).toBe(30);
    expect(daysSinceInoculation(daysAgo(365), NOW)).toBe(365);
  });

  it('returns negative for future inoculation dates', () => {
    expect(daysSinceInoculation(daysAgo(-5), NOW)).toBe(-5);
  });

  it('treats date-only strings as UTC midnight (no TZ drift)', () => {
    // Same calendar day regardless of "now" time-of-day in UTC
    const earlyMorning = new Date('2026-04-27T00:00:01.000Z');
    const lateNight = new Date('2026-04-27T23:59:59.000Z');
    expect(daysSinceInoculation('2026-04-27', earlyMorning)).toBe(0);
    expect(daysSinceInoculation('2026-04-27', lateNight)).toBe(0);
  });

  it('accepts Date objects', () => {
    const d = new Date('2026-04-20T00:00:00.000Z');
    expect(daysSinceInoculation(d, NOW)).toBe(7);
  });

  it('throws on invalid date strings', () => {
    expect(() => daysSinceInoculation('not-a-date', NOW)).toThrow(/Invalid date/);
  });
});

describe('daysUntilExpiry', () => {
  it('returns shelf life when inoculated today', () => {
    expect(daysUntilExpiry(daysAgo(0), 90, NOW)).toBe(90);
  });

  it('returns 1 the day before expiry', () => {
    expect(daysUntilExpiry(daysAgo(89), 90, NOW)).toBe(1);
  });

  it('returns 0 exactly at expiry', () => {
    expect(daysUntilExpiry(daysAgo(90), 90, NOW)).toBe(0);
  });

  it('returns negative past expiry', () => {
    expect(daysUntilExpiry(daysAgo(91), 90, NOW)).toBe(-1);
    expect(daysUntilExpiry(daysAgo(180), 90, NOW)).toBe(-90);
  });

  it('throws when shelfLifeDays is not a positive integer', () => {
    expect(() => daysUntilExpiry(daysAgo(0), 0, NOW)).toThrow();
    expect(() => daysUntilExpiry(daysAgo(0), -1, NOW)).toThrow();
    expect(() => daysUntilExpiry(daysAgo(0), 1.5, NOW)).toThrow();
  });
});

describe('freshnessLabel', () => {
  const SHELF = 90;

  it('returns "fresh" when no time has passed', () => {
    expect(freshnessLabel(daysAgo(0), SHELF, NOW)).toBe('fresh');
  });

  it('returns "fresh" just below the 50% threshold', () => {
    // age=44, shelf=90 → 44*2=88 < 90 → fresh
    expect(freshnessLabel(daysAgo(44), SHELF, NOW)).toBe('fresh');
  });

  it('returns "aging" exactly at the 50% threshold', () => {
    // age=45, shelf=90 → 45*2=90 ≥ 90 → aging
    expect(freshnessLabel(daysAgo(45), SHELF, NOW)).toBe('aging');
  });

  it('returns "aging" the day before expiry', () => {
    expect(freshnessLabel(daysAgo(89), SHELF, NOW)).toBe('aging');
  });

  it('returns "expired" exactly at shelfLifeDays', () => {
    expect(freshnessLabel(daysAgo(90), SHELF, NOW)).toBe('expired');
  });

  it('returns "expired" past shelf life', () => {
    expect(freshnessLabel(daysAgo(120), SHELF, NOW)).toBe('expired');
  });

  it('handles odd shelf lives (50% boundary rounds via doubling)', () => {
    // shelf=7 → boundary at age*2 ≥ 7 → age ≥ 4 (since 3*2=6 < 7, 4*2=8 ≥ 7)
    expect(freshnessLabel(daysAgo(3), 7, NOW)).toBe('fresh');
    expect(freshnessLabel(daysAgo(4), 7, NOW)).toBe('aging');
    expect(freshnessLabel(daysAgo(6), 7, NOW)).toBe('aging');
    expect(freshnessLabel(daysAgo(7), 7, NOW)).toBe('expired');
  });

  it('throws when shelfLifeDays is not a positive integer', () => {
    expect(() => freshnessLabel(daysAgo(0), 0, NOW)).toThrow();
    expect(() => freshnessLabel(daysAgo(0), -10, NOW)).toThrow();
  });
});
