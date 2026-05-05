// Server-side loaders for the dashboard order views (Cell 3.5).
//
// `loadOrderHistory()` returns the signed-in company's orders for the list
// page (RLS scopes by company_id automatically).
// `loadOrder(id)` returns the full order + items + species + (optional)
// allocated batch for the detail page; returns null when the order does
// not exist or belongs to another company.

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { formatLabel } from '@/lib/data/labels';
import { mapOrderItems, type RawOrderItem, type OrderItem } from '@/lib/data/order-items';
import { orderRef as buildOrderRef } from '@/lib/format/refs';
import type { OrderStatus, PaymentMethod } from '@repo/shared';

// Re-export for back-compat with the page files that already import
// these type names from this module.
export type { OrderStatus, PaymentMethod, OrderItem };

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
    const formats = [...new Set(items.map((it) => it.format))];
    const lineFormatLabel =
      formats.length === 1
        ? formatLabel(formats[0]!)
        : items.length > 0
          ? 'Mixed'
          : '—';

    return {
      id: o.id,
      shortRef: buildOrderRef(o.id),
      createdAt: o.created_at,
      itemsLabel,
      formatLabel: lineFormatLabel,
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

  const rawItems = (data.order_items ?? []) as RawOrderItem[];
  const items = mapOrderItems(rawItems);

  return {
    id: data.id,
    shortRef: buildOrderRef(data.id),
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
