// Money formatting helpers. Canonical version of the inline `fmtGBP`
// closures that used to be redeclared in every page and PDF/email view.

/**
 * Formats integer pence as a UK pound amount, e.g. `1250` → `£12.50`.
 */
export function gbp(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
