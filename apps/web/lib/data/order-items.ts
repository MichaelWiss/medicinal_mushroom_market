// Shared mapper for order_items rows loaded with their species join.
//
// Both buyer and admin order-detail loaders select the same nested shape
// and used to duplicate the rawItems.map(...) block. Keep that projection
// here so formatting and fallback labels stay in sync.

import { type FormatKey } from '@/lib/data/species';
import { formatLabel } from '@/lib/data/labels';

export type RawOrderItem = {
  id: string;
  format: string;
  quantity: number;
  unit_price: number;
  allocated_at: string | null;
  batch_id: string | null;
  species_id: string;
  species: { common_name: string; latin_name: string } | null;
};

export type OrderItem = {
  id: string;
  speciesId: string;
  speciesCommonName: string;
  speciesLatinName: string;
  format: FormatKey;
  formatLabel: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  allocatedAt: string | null;
  batchId: string | null;
};

export function mapOrderItems(rawItems: RawOrderItem[]): OrderItem[] {
  return rawItems.map((it) => ({
    id: it.id,
    speciesId: it.species_id,
    speciesCommonName: it.species?.common_name ?? 'Unknown species',
    speciesLatinName: it.species?.latin_name ?? '',
    format: it.format as FormatKey,
    formatLabel: formatLabel(it.format),
    quantity: it.quantity,
    unitPrice: it.unit_price,
    lineTotal: it.unit_price * it.quantity,
    allocatedAt: it.allocated_at,
    batchId: it.batch_id,
  }));
}
