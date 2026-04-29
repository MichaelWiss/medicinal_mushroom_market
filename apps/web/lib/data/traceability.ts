// Server-side loaders for the batch traceability views (Cell 2.6).
//
// `loadOrderIndex` returns confirmed-or-later orders for the signed-in
// company so `/traceability` can list rows that link to detail pages.
// `loadTraceability(orderId)` joins `orders → order_items → species + batches`
// and produces a fresh signed CoA URL per allocated batch.
//
// RLS does the company-isolation work: the cookie-bound server client only
// sees rows belonging to the caller's company, so cross-company access
// returns null (caller -> notFound()).

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import {
  daysSinceInoculation,
  daysUntilExpiry,
  freshnessLabel,
  type FreshnessLabel,
} from '@repo/shared';

const COA_SIGNED_URL_TTL_SECONDS = 60;

export type OrderIndexRow = {
  id: string;
  shortRef: string;
  status: string;
  paymentMethod: string;
  dispatchDate: string | null;
  totalPrice: number;
  itemCount: number;
};

export type TraceItem = {
  itemId: string;
  speciesCommonName: string;
  speciesLatinName: string;
  shelfLifeDays: number;
  format: string;
  quantity: number;
  unitPrice: number;
  allocatedAt: string | null;
  batch: TraceBatch | null;
};

export type TraceBatch = {
  id: string;
  shortRef: string;
  inoculationDate: string;
  harvestDate: string | null;
  substrateLot: string;
  contaminationCheck: 'pending' | 'pass' | 'fail';
  storageZone: string | null;
  yieldKg: number | null;
  freshness: FreshnessLabel;
  daysAgeing: number;
  daysRemaining: number;
  coaUrl: string | null;
  coaError: 'pending' | 'denied' | null;
};

export type OrderTrace = {
  id: string;
  shortRef: string;
  status: string;
  paymentMethod: string;
  dispatchDate: string | null;
  totalPrice: number;
  trackingNumber: string | null;
  items: TraceItem[];
};

const shortRef = (uuid: string) => uuid.slice(0, 8).toUpperCase();

/**
 * Lists the signed-in company's orders for the index page. RLS filters by
 * `company_id = current_company_id()`, so callers from other companies see
 * no rows automatically. Returns `null` when the user is unauthenticated.
 */
export async function loadOrderIndex(): Promise<OrderIndexRow[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, status, payment_method, dispatch_date, total_price, order_items(id)',
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(`loadOrderIndex: ${error.message}`);

  return (data ?? []).map((o) => ({
    id: o.id,
    shortRef: `MYC-${shortRef(o.id)}`,
    status: o.status,
    paymentMethod: o.payment_method,
    dispatchDate: o.dispatch_date,
    totalPrice: o.total_price,
    itemCount: Array.isArray(o.order_items) ? o.order_items.length : 0,
  }));
}

/**
 * Loads a single order's batch traceability, including a fresh signed CoA
 * URL per allocated batch. Returns `null` if the order does not exist
 * *or* belongs to another company (RLS hides foreign rows).
 */
export async function loadTraceability(
  orderId: string,
): Promise<OrderTrace | null> {
  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select(
      `id, status, payment_method, dispatch_date, total_price, tracking_number,
       order_items (
         id, format, quantity, unit_price, allocated_at,
         species:species_id ( common_name, latin_name, shelf_life_days ),
         batch:batch_id (
           id, inoculation_date, harvest_date, substrate_lot,
           contamination_check, storage_zone, yield_kg
         )
       )`,
    )
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) throw new Error(`loadTraceability: ${orderErr.message}`);
  if (!order) return null;

  const rawItems = (order.order_items ?? []) as Array<{
    id: string;
    format: string;
    quantity: number;
    unit_price: number;
    allocated_at: string | null;
    species:
      | { common_name: string; latin_name: string; shelf_life_days: number }
      | null;
    batch:
      | {
          id: string;
          inoculation_date: string;
          harvest_date: string | null;
          substrate_lot: string;
          contamination_check: 'pending' | 'pass' | 'fail';
          storage_zone: string | null;
          yield_kg: number | string | null;
        }
      | null;
  }>;

  const items: TraceItem[] = await Promise.all(
    rawItems.map(async (it) => {
      const species = it.species;
      const batch = it.batch;

      let traceBatch: TraceBatch | null = null;
      if (batch && species) {
        const { coaUrl, coaError } = await signCoaUrl(supabase, batch.id);
        traceBatch = {
          id: batch.id,
          shortRef: `BCH-${shortRef(batch.id)}`,
          inoculationDate: batch.inoculation_date,
          harvestDate: batch.harvest_date,
          substrateLot: batch.substrate_lot,
          contaminationCheck: batch.contamination_check,
          storageZone: batch.storage_zone,
          yieldKg:
            batch.yield_kg === null || batch.yield_kg === undefined
              ? null
              : Number(batch.yield_kg),
          freshness: freshnessLabel(
            batch.inoculation_date,
            species.shelf_life_days,
          ),
          daysAgeing: daysSinceInoculation(batch.inoculation_date),
          daysRemaining: daysUntilExpiry(
            batch.inoculation_date,
            species.shelf_life_days,
          ),
          coaUrl,
          coaError,
        };
      }

      return {
        itemId: it.id,
        speciesCommonName: species?.common_name ?? 'Unknown species',
        speciesLatinName: species?.latin_name ?? '',
        shelfLifeDays: species?.shelf_life_days ?? 0,
        format: it.format,
        quantity: it.quantity,
        unitPrice: it.unit_price,
        allocatedAt: it.allocated_at,
        batch: traceBatch,
      };
    }),
  );

  return {
    id: order.id,
    shortRef: `MYC-${shortRef(order.id)}`,
    status: order.status,
    paymentMethod: order.payment_method,
    dispatchDate: order.dispatch_date,
    totalPrice: order.total_price,
    trackingNumber: order.tracking_number,
    items,
  };
}

/**
 * Generates a short-lived signed URL for `coa/{batch_id}.pdf`.
 *
 * Storage RLS gates URL **generation** — a user from another company never
 * gets here because `loadTraceability` already returned null. We still
 * surface a graceful empty state when the object is missing (orders placed
 * before ops uploads the CoA) instead of throwing.
 */
async function signCoaUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
): Promise<{ coaUrl: string | null; coaError: 'pending' | 'denied' | null }> {
  const { data, error } = await supabase.storage
    .from('coa')
    .createSignedUrl(`${batchId}.pdf`, COA_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    // Storage returns the same shape for "object missing" and "RLS denied"
    // — treat both as a soft empty state so the page still renders.
    return { coaUrl: null, coaError: 'pending' };
  }
  return { coaUrl: data.signedUrl, coaError: null };
}
