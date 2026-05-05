// Shared batch allocation for order creation flows.
//
// Allocates stock per line via `allocate_batch` RPC and writes
// `order_items` rows with `batch_id` + `allocated_at`. Used by:
//   - Net-30 checkout (immediate allocation on confirm)
//   - Quote approval (allocation on buyer accept)
//
// The Stripe webhook has its own allocation path because it must handle
// partial allocation / backorder semantics (leave order pending and
// retry). This helper is for the synchronous "allocate all or roll back"
// flows.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@repo/db';
import type { ProductFormat } from '@repo/shared';

export interface AllocationLine {
  speciesId: string;
  speciesName: string;
  format: ProductFormat;
  quantity: number;
  /** Discounted unit price in pence/cents to store on the order_items row. */
  unitPrice: number;
}

export type AllocateOrderResult =
  | { ok: true }
  | { ok: false; code: 'allocation_failed' | 'db_error'; error: string };

/**
 * Allocates batches and inserts order_items for every line. On any
 * failure, performs best-effort rollback (delete order_items + order).
 *
 * @param admin  Service-role Supabase client (bypasses RLS).
 * @param orderId  The order to attach items to.
 * @param lines  Lines to allocate.
 */
export async function allocateOrderLines(
  admin: SupabaseClient<Database>,
  orderId: string,
  lines: AllocationLine[],
): Promise<AllocateOrderResult> {
  for (const line of lines) {
    const { data: batchId, error: allocErr } = await admin.rpc('allocate_batch', {
      p_species_id: line.speciesId,
      p_qty: line.quantity,
    });
    if (allocErr || !batchId) {
      await rollback(admin, orderId);
      return {
        ok: false,
        code: 'allocation_failed',
        error:
          allocErr?.message ??
          `Allocation failed for ${line.speciesName}. Stock may have shifted.`,
      };
    }
    const { error: itemErr } = await admin.from('order_items').insert({
      order_id: orderId,
      species_id: line.speciesId,
      batch_id: batchId,
      format: line.format,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      allocated_at: new Date().toISOString(),
    });
    if (itemErr) {
      await rollback(admin, orderId);
      return {
        ok: false,
        code: 'db_error',
        error: `Could not write order line: ${itemErr.message}`,
      };
    }
  }
  return { ok: true };
}

async function rollback(
  admin: SupabaseClient<Database>,
  orderId: string,
): Promise<void> {
  await admin.from('order_items').delete().eq('order_id', orderId);
  await admin.from('orders').delete().eq('id', orderId);
}
