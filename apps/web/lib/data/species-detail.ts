// Server-side loader for the species detail page (Cell 2.5).
//
// Joins the species row with its passing batches (for the freshest-batch
// indicator and aggregate availability), and resolves the buyer's company
// tier from the auth session so we can apply tier pricing via
// `calculateLinePrice` from `@repo/shared`.
//
// Unauthenticated visitors fall through to the `spot` tier (list price).

import { createClient } from '@/lib/supabase/server';
import {
  calculateLinePrice,
  type CompanyTier,
} from '@repo/shared';
import { presentationFor } from './species-presentation';
import type { FormatKey, SpeciesKey } from './species';

export type SpeciesBatch = {
  id: string;
  inoculationDate: string;
  harvestDate: string | null;
  substrateLot: string;
  storageZone: string | null;
  availableUnits: number;
};

export type SpeciesFormatPrice = {
  format: FormatKey;
  /** List price (pre-discount) per unit, in pounds. */
  listPrice: number;
  /** Discounted price per unit, in pounds, for the resolved tier. */
  tierPrice: number;
};

export type SpeciesDetail = {
  id: string;
  num: string;
  key: SpeciesKey;
  cartId: number;
  commonName: string;
  latinName: string;
  substrateType: string;
  shelfLifeDays: number;
  shelfLabel: string;
  coldChainRequired: boolean;
  dispatchWindow: string[];
  dispatch: 'MON' | 'ANY';
  datasheetUrl: string | null;
  /** Sum of `available_units` across passing batches. */
  totalUnits: number;
  /** Per-format pricing for the buyer's tier. */
  formats: SpeciesFormatPrice[];
  /** Freshest passing batch (by harvest_date desc, then inoculation_date desc). */
  freshestBatch: SpeciesBatch | null;
  /** Resolved buyer tier; `spot` if unauthenticated. */
  tier: CompanyTier;
};

function shelfLabel(days: number): string {
  if (days >= 365) {
    const months = Math.round(days / 30);
    return months >= 12
      ? `${Math.round(months / 12)} year${months >= 24 ? 's' : ''}`
      : `${months} months`;
  }
  if (days >= 30) return `${Math.round(days / 30)} months`;
  return `${days} days`;
}

function dispatchOf(window: string[]): 'MON' | 'ANY' {
  return window.length === 1 && window[0] === 'MON' ? 'MON' : 'ANY';
}

function freshestOf(rows: readonly SpeciesBatch[]): SpeciesBatch | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    const ah = a.harvestDate ?? '';
    const bh = b.harvestDate ?? '';
    if (ah !== bh) return bh.localeCompare(ah);
    return b.inoculationDate.localeCompare(a.inoculationDate);
  });
  return sorted[0]!;
}

/**
 * Loads the buyer's tier from `company_users` → `companies.tier`.
 * Falls back to `spot` if no session, no membership, or any error.
 */
async function resolveTier(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<CompanyTier> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'spot';

  const { data, error } = await supabase
    .from('company_users')
    .select('companies(tier)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return 'spot';
  const tier = (data.companies as { tier: CompanyTier } | null)?.tier;
  return tier ?? 'spot';
}

/**
 * Loads a single species + passing batches + tier-priced formats.
 * Returns `null` when the id is unknown (caller should `notFound()`).
 */
export async function loadSpeciesDetail(
  speciesId: string,
): Promise<SpeciesDetail | null> {
  const supabase = await createClient();

  const [{ data: species, error: speciesErr }, { data: batchRows, error: batchErr }, tier] =
    await Promise.all([
      supabase
        .from('species')
        .select(
          'id, common_name, latin_name, substrate_type, shelf_life_days, cold_chain_required, dispatch_window, datasheet_url',
        )
        .eq('id', speciesId)
        .maybeSingle(),
      supabase
        .from('batches')
        .select(
          'id, inoculation_date, harvest_date, substrate_lot, storage_zone, available_units',
        )
        .eq('species_id', speciesId)
        .eq('contamination_check', 'pass'),
      resolveTier(supabase),
    ]);

  if (speciesErr) throw new Error(`loadSpeciesDetail: ${speciesErr.message}`);
  if (batchErr) throw new Error(`loadSpeciesDetail: ${batchErr.message}`);
  if (!species) return null;

  const batches: SpeciesBatch[] = (batchRows ?? []).map((b) => ({
    id: b.id,
    inoculationDate: b.inoculation_date,
    harvestDate: b.harvest_date,
    substrateLot: b.substrate_lot,
    storageZone: b.storage_zone,
    availableUnits: b.available_units ?? 0,
  }));
  const totalUnits = batches.reduce((n, b) => n + b.availableUnits, 0);

  const presentation = presentationFor(species.latin_name);
  const listPrice = presentation.price;
  const listPence = Math.round(listPrice * 100);

  const formats: SpeciesFormatPrice[] = presentation.formats.map((format) => ({
    format,
    listPrice,
    // Quantity 1 → pure tier discount (volume break is 0% at qty 1).
    tierPrice: calculateLinePrice(listPence, 1, tier) / 100,
  }));

  return {
    id: species.id,
    num: presentation.num,
    key: presentation.key,
    cartId: presentation.cartId,
    commonName: species.common_name,
    latinName: species.latin_name,
    substrateType: species.substrate_type,
    shelfLifeDays: species.shelf_life_days,
    shelfLabel: shelfLabel(species.shelf_life_days),
    coldChainRequired: species.cold_chain_required,
    dispatchWindow: species.dispatch_window,
    dispatch: dispatchOf(species.dispatch_window),
    datasheetUrl: species.datasheet_url,
    totalUnits,
    formats,
    freshestBatch: freshestOf(batches),
    tier,
  };
}
