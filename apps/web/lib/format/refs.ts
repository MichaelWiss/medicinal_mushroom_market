// Short, human-readable identifiers derived from a UUID. Replaces the
// duplicated `shortRef` / `shortBatchRef` closures across loaders and
// pages.

/**
 * First 8 hex characters of a UUID, uppercased. Used as the suffix of
 * every domain-specific reference (`MYC-`, `BCH-`, `INV-`).
 */
export function shortId(uuid: string): string {
  return uuid.slice(0, 8).toUpperCase();
}

/** `MYC-XXXXXXXX` — buyer-facing order reference. */
export function orderRef(uuid: string): string {
  return `MYC-${shortId(uuid)}`;
}

/** `BCH-XXXXXXXX` — batch reference shown on traceability + admin views. */
export function batchRef(uuid: string): string {
  return `BCH-${shortId(uuid)}`;
}

/** `INV-XXXXXXXX` — invoice number used by the Net-30 PDF + email. */
export function invoiceRef(uuid: string): string {
  return `INV-${shortId(uuid)}`;
}

/** `XXXXXXXX` — short quote reference (no prefix). */
export function quoteRef(uuid: string): string {
  return shortId(uuid);
}
