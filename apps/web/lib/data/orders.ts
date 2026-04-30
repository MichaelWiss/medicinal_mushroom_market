// Server-side loaders for the dashboard order views (Cell 3.5).
//
// `loadOrderHistory()` returns the signed-in company's orders for the list
// page (RLS scopes by company_id automatically).
// `loadOrder(id)` returns the full order + items + species + (optional)
// allocated batch for the detail page; returns null when the order does
// not exist or belongs to another company.

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { FMT, type FormatKey } from '@/lib/data/species';

const shortRef = (uuid: string) => `MYC-${uuid.slice(0, 8).toUpperCase()}`;

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'picking'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'card' | 'net30';

export type OrderHistoryRow = {
  id: string;
  shortRef: string;
  createdAt: string;
  itemsLabel: string;
  formatLabel: string;
  totalPrice: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  trackingNumber: string | null;
  dispatchDate: string | null;
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

export type OrderDetail = {
  id: string;
  shortRef: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  dispatchDate: string | null;
  totalPrice: number;
  trackingNumber: string | null;
  stripeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
};

const formatLabelFor = (key: string): string =>
  (FMT as Record<string, string>)[key] ?? key;

/**
 * Lists every order for the signed-in company, newest first. Returns
 * `null` when there is no session so the page can redirect.
 */
export async function loadOrderHistory(): Promise<OrderHistoryRow[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('orders')
    .select(
      `id, status, payment_method, dispatch_date, total_price,
       tracking_number, created_at,
       order_items (
         quantity, format,
         species:species_id ( common_name )
       )`,
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(`loadOrderHistory: ${error.message}`);

  return (data ?? []).map((o) => {
    const items = (o.order_items ?? []) as Array<{
      quantity: number;
      format: string;
      species: { common_name: string } | null;
    }>;

    const itemsLabel = items.length
      ? items
          .map(
            (it) =>
              `${it.species?.common_name ?? 'Unknown'} ×${it.quantity}`,
          )
          .join(', ')
      : '—';

    // If every line shares a format, surface it; otherwise show "Mixed".
    const formats = new Set(items.map((it) => it.format));
    const formatLabel =
      formats.size === 1
        ? formatLabelFor([...formats][0])
        : items.length > 0
          ? 'Mixed'
          : '—';

    return {
      id: o.id,
      shortRef: shortRef(o.id),
      createdAt: o.created_at,
      itemsLabel,
      formatLabel,
      totalPrice: o.total_price,
      status: o.status as OrderStatus,
      paymentMethod: o.payment_method as PaymentMethod,
      trackingNumber: o.tracking_number,
      dispatchDate: o.dispatch_date,
    };
  });
}

/**
 * Loads one order with its items + species names + optional batch id.
 * RLS hides foreign-company rows → returns null → caller calls notFound().
 */
export async function loadOrder(orderId: string): Promise<OrderDetail | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('orders')
    .select(
      `id, status, payment_method, dispatch_date, total_price,
       tracking_number, stripe_session_id, created_at, updated_at,
       order_items (
         id, format, quantity, unit_price, allocated_at, batch_id, species_id,
         species:species_id ( common_name, latin_name )
       )`,
    )
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(`loadOrder: ${error.message}`);
  if (!data) return null;

  const rawItems = (data.order_items ?? []) as Array<{
    id: string;
    format: string;
    quantity: number;
    unit_price: number;
    allocated_at: string | null;
    batch_id: string | null;
    species_id: string;
    species: { common_name: string; latin_name: string } | null;
  }>;

  const items: OrderItem[] = rawItems.map((it) => ({
    id: it.id,
    speciesId: it.species_id,
    speciesCommonName: it.species?.common_name ?? 'Unknown species',
    speciesLatinName: it.species?.latin_name ?? '',
    format: it.format as FormatKey,
    formatLabel: formatLabelFor(it.format),
    quantity: it.quantity,
    unitPrice: it.unit_price,
    lineTotal: it.unit_price * it.quantity,
    allocatedAt: it.allocated_at,
    batchId: it.batch_id,
  }));

  return {
    id: data.id,
    shortRef: shortRef(data.id),
    status: data.status as OrderStatus,
    paymentMethod: data.payment_method as PaymentMethod,
    dispatchDate: data.dispatch_date,
    totalPrice: data.total_price,
    trackingNumber: data.tracking_number,
    stripeSessionId: data.stripe_session_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    items,
  };
}
