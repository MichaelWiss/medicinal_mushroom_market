// Server-side catalogue loader. Fetches species + aggregated passing-batch
// units from Supabase in a single round-trip and merges with the local
// presentation map so the storefront renders demo-faithful rows backed by
// real DB state.
//
// Used by the ISR storefront page (Cell 2.4). Realtime updates are layered
// on the client; this module only seeds the initial render.

import { createAnonClient } from '@/lib/supabase/anon';
import { presentationFor } from './species-presentation';
import type { FormatKey, SpeciesKey } from './species';

export type CatalogueSpecies = {
  /** DB uuid — primary key, used for Realtime correlation. */
  id: string;
  /** Numeric id understood by the demo CartProvider (Cell 2.7 will replace). */
  cartId: number;
  /** Two-digit catalogue number. */
  num: string;
  /** Presentation key for IMGS / BG colour map. */
  key: SpeciesKey;
  name: string;
  latin: string;
  formats: FormatKey[];
  /** 'MON' = Monday-only, 'ANY' = any dispatch day. */
  dispatch: 'MON' | 'ANY';
  cold: boolean;
  /** Sum of `available_units` across passing batches. */
  units: number;
  price: number;
  /** Human-readable shelf life label, e.g. "7 days" / "12 months". */
  shelf: string;
};

function shelfLabel(days: number): string {
  if (days >= 365) {
    const months = Math.round(days / 30);
    return months >= 12
      ? `${Math.round(months / 12)} year${months >= 24 ? 's' : ''}`
      : `${months} months`;
  }
  if (days >= 30) {
    return `${Math.round(days / 30)} months`;
  }
  return `${days} days`;
}

function dispatchOf(window: string[]): 'MON' | 'ANY' {
  return window.length === 1 && window[0] === 'MON' ? 'MON' : 'ANY';
}

/**
 * Loads the full catalogue with live unit counts.
 *
 * - Reads through the cookie-bound server client; with the Cell 2.4
 *   migration, `species` and passing `batches` are anon-readable so the
 *   storefront works without auth.
 * - Aggregates `available_units` per species in JS rather than via a
 *   PostgREST `group by` (PostgREST has no native aggregation; pulling the
 *   small batch row set is cheaper than a custom RPC at this scale).
 */
export async function loadCatalogue(): Promise<CatalogueSpecies[]> {
  const supabase = createAnonClient();

  const [{ data: speciesRows, error: speciesErr }, { data: batchRows, error: batchErr }] =
    await Promise.all([
      supabase
        .from('species')
        .select(
          'id, common_name, latin_name, shelf_life_days, cold_chain_required, dispatch_window',
        )
        .order('common_name'),
      supabase
        .from('batches')
        .select('species_id, available_units')
        .eq('contamination_check', 'pass'),
    ]);

  if (speciesErr) throw new Error(`loadCatalogue: ${speciesErr.message}`);
  if (batchErr) throw new Error(`loadCatalogue: ${batchErr.message}`);
  if (!speciesRows) return [];

  const unitsBySpecies = new Map<string, number>();
  for (const b of batchRows ?? []) {
    unitsBySpecies.set(
      b.species_id,
      (unitsBySpecies.get(b.species_id) ?? 0) + (b.available_units ?? 0),
    );
  }

  return speciesRows.map((s) => {
    const p = presentationFor(s.latin_name);
    return {
      id: s.id,
      cartId: p.cartId,
      num: p.num,
      key: p.key,
      name: s.common_name,
      latin: s.latin_name,
      formats: p.formats,
      dispatch: dispatchOf(s.dispatch_window),
      cold: s.cold_chain_required,
      units: unitsBySpecies.get(s.id) ?? 0,
      price: p.price,
      shelf: shelfLabel(s.shelf_life_days),
    };
  });
}
