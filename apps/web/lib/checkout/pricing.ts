// Server-only trusted-line resolver (security plan step 5).
//
// Cart payloads cross the client → server boundary with `unitPrice` and
// `speciesName` populated by the client. Treating those fields as truth
// is unsafe: a tampered localStorage cart (or a direct call to a Server
// Action) can submit `unitPrice: 0` and produce zero-cost Stripe sessions
// or zero-cost Net-30 confirmed orders.
//
// This module re-derives both fields server-side from:
//   • `species.common_name` and `species.latin_name` (from the DB)
//   • `PRESENTATION_BY_LATIN[latin_name]` (the canonical price + allowed
//     formats list)
//
// Server Actions should call `resolveTrustedLine` for every cart line
// AFTER loading the species rows, then drop the client-supplied
// `unitPrice` / `speciesName` fields entirely.

import 'server-only';
import {
  PRESENTATION_BY_LATIN,
  type SpeciesPresentation,
} from '@/lib/data/species-presentation';
import type { CartItemInput } from '@repo/shared';

export type TrustedLine = {
  speciesId: string;
  /** Server-resolved common name (used for Stripe line items + invoice PDF). */
  speciesName: string;
  format: CartItemInput['format'];
  /** Per-unit price in pence/cents, server-derived. */
  unitPricePence: number;
  quantity: number;
};

export type ResolveTrustedLineResult =
  | { ok: true; line: TrustedLine }
  | { ok: false; code: 'unknown_species' | 'unknown_format'; message: string };

/**
 * Build a TrustedLine from a DB species row + a (format, quantity) pair
 * coming from the client. Returns an error result when the species is
 * missing from the presentation map or the requested format is not
 * offered for that species.
 *
 * Quantity is forwarded through unchanged; positivity / integer-ness is
 * enforced upstream by `cartItemSchema` (Zod).
 */
export function resolveTrustedLine(
  species: { id: string; common_name: string; latin_name: string },
  format: CartItemInput['format'],
  quantity: number,
): ResolveTrustedLineResult {
  const presentation: SpeciesPresentation | undefined =
    PRESENTATION_BY_LATIN[species.latin_name];

  if (!presentation) {
    return {
      ok: false,
      code: 'unknown_species',
      message: `Pricing not configured for ${species.common_name}.`,
    };
  }

  if (!presentation.formats.includes(format)) {
    return {
      ok: false,
      code: 'unknown_format',
      message: `${species.common_name} is not available in ${format}.`,
    };
  }

  return {
    ok: true,
    line: {
      speciesId: species.id,
      speciesName: species.common_name,
      format,
      // PRESENTATION map carries GBP units; convert to integer pence.
      unitPricePence: Math.round(presentation.price * 100),
      quantity,
    },
  };
}
