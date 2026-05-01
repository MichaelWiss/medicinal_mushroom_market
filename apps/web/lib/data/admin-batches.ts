// Service-role loaders for the admin batch console (Cell 6.4).
//
// Operators don't belong to a single buyer company so we read with the
// admin client (mirrors `lib/data/admin-orders.ts`). Route gating:
// `/console` lives in `PROTECTED_PREFIXES`, so anonymous callers are
// redirected to /sign-in by middleware before they reach this loader.
// All mutating Server Actions in `app/actions/batches.ts` re-verify the
// session.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type ContaminationResult = 'pending' | 'pass' | 'fail';

export type AdminBatchRow = {
  id: string;
  shortRef: string;
  speciesId: string;
  speciesCommonName: string;
  speciesLatinName: string;
  inoculationDate: string;
  harvestDate: string | null;
  substrateLot: string;
  contaminationCheck: ContaminationResult;
  availableUnits: number;
  yieldKg: number | null;
  storageZone: string | null;
  coaUrl: string | null;
  createdAt: string;
};

const shortBatchRef = (uuid: string) =>
  `BCH-${uuid.slice(0, 8).toUpperCase()}`;

export async function loadAdminBatches(filter?: {
  contaminationCheck?: ContaminationResult;
}): Promise<AdminBatchRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from('batches')
    .select(
      `id, species_id, inoculation_date, harvest_date, substrate_lot,
       contamination_check, available_units, yield_kg, storage_zone,
       coa_url, created_at,
       species:species_id ( common_name, latin_name )`,
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (filter?.contaminationCheck) {
    q = q.eq('contamination_check', filter.contaminationCheck);
  }

  const { data, error } = await q;
  if (error) throw new Error(`loadAdminBatches: ${error.message}`);

  return (data ?? []).map((b) => {
    const species = b.species as
      | { common_name: string; latin_name: string }
      | null;
    return {
      id: b.id,
      shortRef: shortBatchRef(b.id),
      speciesId: b.species_id,
      speciesCommonName: species?.common_name ?? 'Unknown species',
      speciesLatinName: species?.latin_name ?? '',
      inoculationDate: b.inoculation_date,
      harvestDate: b.harvest_date,
      substrateLot: b.substrate_lot,
      contaminationCheck: b.contamination_check as ContaminationResult,
      availableUnits: b.available_units,
      yieldKg: b.yield_kg === null || b.yield_kg === undefined
        ? null
        : Number(b.yield_kg),
      storageZone: b.storage_zone,
      coaUrl: b.coa_url,
      createdAt: b.created_at,
    };
  });
}

export async function loadAdminBatch(
  id: string,
): Promise<AdminBatchRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('batches')
    .select(
      `id, species_id, inoculation_date, harvest_date, substrate_lot,
       contamination_check, available_units, yield_kg, storage_zone,
       coa_url, created_at,
       species:species_id ( common_name, latin_name )`,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`loadAdminBatch: ${error.message}`);
  if (!data) return null;

  const species = data.species as
    | { common_name: string; latin_name: string }
    | null;

  return {
    id: data.id,
    shortRef: shortBatchRef(data.id),
    speciesId: data.species_id,
    speciesCommonName: species?.common_name ?? 'Unknown species',
    speciesLatinName: species?.latin_name ?? '',
    inoculationDate: data.inoculation_date,
    harvestDate: data.harvest_date,
    substrateLot: data.substrate_lot,
    contaminationCheck: data.contamination_check as ContaminationResult,
    availableUnits: data.available_units,
    yieldKg:
      data.yield_kg === null || data.yield_kg === undefined
        ? null
        : Number(data.yield_kg),
    storageZone: data.storage_zone,
    coaUrl: data.coa_url,
    createdAt: data.created_at,
  };
}

/**
 * Returns a fresh signed URL for an uploaded CoA PDF (60 s ttl) so ops can
 * preview what buyers will see. Returns null if the object isn't there yet.
 *
 * Mirrors the `signCoaUrl` helper in `lib/data/traceability.ts` but lives
 * here so the admin route doesn't need a buyer-side import.
 */
export async function signAdminCoaUrl(
  batchId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from('coa')
    .createSignedUrl(`${batchId}.pdf`, 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
