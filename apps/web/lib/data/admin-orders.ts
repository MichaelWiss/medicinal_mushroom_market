// Server-side admin loaders for the ops order workflow (Cell 6.2).
//
// Operators don't belong to a single company so we read with the
// service-role client (same pattern as `app/(admin)/console/quotes/page.tsx`).
// Route gating: `/console` is in `PROTECTED_PREFIXES`, so anonymous
// callers are redirected to /sign-in by middleware. The mutating
// Server Actions in `app/actions/dispatch.ts` re-verify the session.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatLabel } from '@/lib/data/labels';
import { mapOrderItems, type RawOrderItem } from '@/lib/data/order-items';
import { parseShippingAddress } from '@/lib/data/shipping-address';
import { orderRef as buildOrderRef } from '@/lib/format/refs';
import type {
  OrderDetail,
  OrderHistoryRow,
  OrderStatus,
  PaymentMethod,
} from '@/lib/data/orders';
import type { ShippingAddress } from '@repo/shared';

export type AdminOrderRow = OrderHistoryRow & {
  companyId: string;
  companyName: string;
};

export type AdminOrderDetail = OrderDetail & {
  companyId: string;
  companyName: string;
  shippingAddress: ShippingAddress | null;
};


export async function loadAdminOrders(filter?: {
  status?: OrderStatus;
}): Promise<AdminOrderRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from('orders')
    .select(
      `id, status, payment_method, dispatch_date, total_price,
       tracking_number, created_at, company_id,
       companies:company_id ( name ),
       order_items (
         quantity, format,
         species:species_id ( common_name )
       )`,
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (filter?.status) q = q.eq('status', filter.status);

  const { data, error } = await q;
  if (error) throw new Error(`loadAdminOrders: ${error.message}`);

  return (data ?? []).map((o) => {
    const items = (o.order_items ?? []) as Array<{
      quantity: number;
      format: string;
      species: { common_name: string } | null;
    }>;
    const company = o.companies as { name: string } | null;

    const itemsLabel = items.length
      ? items
          .map(
            (it) => `${it.species?.common_name ?? 'Unknown'} ×${it.quantity}`,
          )
          .join(', ')
      : '—';
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
      companyId: o.company_id,
      companyName: company?.name ?? '—',
    };
  });
}

export async function loadAdminOrder(
  orderId: string,
): Promise<AdminOrderDetail | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('orders')
    .select(
      `id, status, payment_method, dispatch_date, total_price,
       tracking_number, stripe_session_id, created_at, updated_at,
       company_id,
       companies:company_id ( name, shipping_address ),
       order_items (
         id, format, quantity, unit_price, allocated_at, batch_id, species_id,
         species:species_id ( common_name, latin_name )
       )`,
    )
    .eq('id', orderId)
    .maybeSingle();
  if (error) throw new Error(`loadAdminOrder: ${error.message}`);
  if (!data) return null;

  const company = data.companies as
    | { name: string; shipping_address: unknown }
    | null;

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
    companyId: data.company_id,
    companyName: company?.name ?? '—',
    shippingAddress: parseShippingAddress(company?.shipping_address),
  };
}
