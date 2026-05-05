// Shared cart validation for checkout flows (card + Net-30).
//
// Validates stock availability, dispatch-window compliance, and resolves
// trusted lines (server-derived prices) for every cart item. Used by
// both `startCheckout` and `startNet30Checkout` to eliminate the ~70-line
// near-identical validation block that was duplicated across both actions.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@repo/db';
import type { CartItemInput } from '@repo/shared';
import { isDispatchAllowed } from './dispatch';
import { resolveTrustedLine, type TrustedLine } from './pricing';

export type ValidateCartResult =
  | { ok: true; trustedLines: TrustedLine[] }
  | { ok: false; code: ValidateCartErrorCode; error: string };

export type ValidateCartErrorCode =
  | 'db_error'
  | 'invalid_dispatch_date'
  | 'insufficient_stock'
  | 'invalid_input';

/**
 * Validates a cart against live DB state:
 *   1. Fetches species rows + passing batch stock in parallel.
 *   2. Checks aggregate stock per species against requested quantities.
 *   3. Validates the dispatch date against each species' dispatch_window.
 *   4. Resolves every line to a TrustedLine (server-derived price).
 *
 * The supabase client should be the cookie-bound server client (RLS-bound)
 * so the caller's session scoping applies to species/batch reads.
 */
export async function validateCart(
  supabase: SupabaseClient<Database>,
  items: CartItemInput[],
  dispatchDate: string,
): Promise<ValidateCartResult> {
  const speciesIds = Array.from(new Set(items.map((i) => i.speciesId)));

  const [{ data: speciesRows, error: speciesErr }, { data: batchRows, error: batchErr }] =
    await Promise.all([
      supabase
        .from('species')
        .select('id, common_name, latin_name, dispatch_window')
        .in('id', speciesIds),
      supabase
        .from('batches')
        .select('species_id, available_units, contamination_check')
        .in('species_id', speciesIds)
        .eq('contamination_check', 'pass'),
    ]);

  if (speciesErr || batchErr || !speciesRows) {
    return {
      ok: false,
      code: 'db_error',
      error: 'Could not validate cart against current stock.',
    };
  }

  const speciesById = new Map(speciesRows.map((s) => [s.id, s]));
  const stockBySpecies = new Map<string, number>();
  for (const b of batchRows ?? []) {
    stockBySpecies.set(
      b.species_id,
      (stockBySpecies.get(b.species_id) ?? 0) + (b.available_units ?? 0),
    );
  }

  const dispatchUTC = new Date(`${dispatchDate}T00:00:00.000Z`);
  if (Number.isNaN(dispatchUTC.getTime())) {
    return {
      ok: false,
      code: 'invalid_dispatch_date',
      error: 'Invalid dispatch date.',
    };
  }

  // Aggregate quantity per species (a species may appear in multiple
  // lines via different formats).
  const requestedBySpecies = new Map<string, number>();
  for (const it of items) {
    requestedBySpecies.set(
      it.speciesId,
      (requestedBySpecies.get(it.speciesId) ?? 0) + it.quantity,
    );
  }

  for (const [speciesId, requested] of requestedBySpecies) {
    const sp = speciesById.get(speciesId);
    if (!sp) {
      return { ok: false, code: 'invalid_input', error: 'Unknown species in cart.' };
    }
    const stock = stockBySpecies.get(speciesId) ?? 0;
    if (stock < requested) {
      return {
        ok: false,
        code: 'insufficient_stock',
        error: `Insufficient stock for ${sp.common_name}. Available: ${stock}.`,
      };
    }
    if (!isDispatchAllowed(sp.dispatch_window, dispatchUTC)) {
      return {
        ok: false,
        code: 'invalid_dispatch_date',
        error: `${sp.common_name} cannot dispatch on the selected date (allowed: ${sp.dispatch_window.join(', ')}).`,
      };
    }
  }

  // Resolve trusted lines — drop client-supplied unitPrice / speciesName.
  const trustedLines: TrustedLine[] = [];
  for (const it of items) {
    const sp = speciesById.get(it.speciesId);
    if (!sp) {
      return { ok: false, code: 'invalid_input', error: 'Unknown species in cart.' };
    }
    const resolved = resolveTrustedLine(
      { id: sp.id, common_name: sp.common_name, latin_name: sp.latin_name },
      it.format,
      it.quantity,
    );
    if (!resolved.ok) {
      return { ok: false, code: 'invalid_input', error: resolved.message };
    }
    trustedLines.push(resolved.line);
  }

  return { ok: true, trustedLines };
}
