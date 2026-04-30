// Dispatch-window helpers shared by the cart/checkout flow.
//
// Species rows store an array like `['MON']` or `['ANY']`. JS getDay
// returns 0..6 (Sun..Sat); we map to the same three-letter codes the DB
// uses so we can validate user-selected dispatch dates without round-
// tripping through SQL.

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export type DayCode = (typeof DOW)[number];

export function dayCodeOf(date: Date): DayCode {
  return DOW[date.getUTCDay()]!;
}

/** True when `dispatchDate` is allowed by the species `dispatch_window`. */
export function isDispatchAllowed(
  dispatchWindow: readonly string[],
  dispatchDate: Date,
): boolean {
  if (dispatchWindow.includes('ANY')) return true;
  return dispatchWindow.includes(dayCodeOf(dispatchDate));
}

/** Returns the next Monday on or after `from` (UTC). */
export function nextMonday(from: Date = new Date()): Date {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const offset = (1 - d.getUTCDay() + 7) % 7 || 7; // skip today, pick next Mon
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
}

/** ISO yyyy-mm-dd in UTC. */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
