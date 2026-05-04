// Date formatting helpers. Canonical replacements for the inline
// `fmtDate` / `fmtDateTime` closures that used to be redeclared in
// every page that surfaces an ISO timestamp.

/**
 * Formats an ISO date (or null) as `02 May 2026` in the en-GB locale.
 * Returns `'—'` for null/undefined.
 */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Formats an ISO timestamp as `02 May 2026 14:30` in the en-GB locale.
 */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
