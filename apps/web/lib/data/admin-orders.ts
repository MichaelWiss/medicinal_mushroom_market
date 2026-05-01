// Server-side admin loaders for the ops order workflow (Cell 6.2).
//
// Operators don't belong to a single company so we read with the
// service-role client (same pattern as `app/(admin)/console/quotes/page.tsx`).
// Route gating: `/console` is in `PROTECTED_PREFIXES`, so anonymous
// callers are redirected to /sign-in by middleware. The mutating
// Server Actions in `app/actions/dispatch.ts` re-verify the session.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { FMT, type FormatKey } from '@/lib/data/species';
import type {
  OrderDetail,
  OrderHistoryRow,
  OrderItem,
  OrderStatus,
  PaymentMethod,
} from '@/lib/data/orders';

const shortRef = (uuid: string) => `MYC-${uuid.slice(0, 8).toUpperCase()}`;
const formatLabelFor = (key: string): string =>
  (FMT as Record<string, string>)[key] ?? key;

export type AdminOrderRow = OrderHistoryRow & {
  companyId: string;
  companyName: string;
};

export type AdminOrderDetail = OrderDetail & {
  companyId: string;
  companyName: string;
  shippingAddress: ShippingAddress | null;
};

export type ShippingAddress = {
  name?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
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
    const formatLabel =
      formats.length === 1
        ? formatLabelFor(formats[0]!)
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
    companyId: data.company_id,
    companyName: company?.name ?? '—',
    shippingAddress: parseShippingAddress(company?.shipping_address),
  };
}

function parseShippingAddress(raw: unknown): ShippingAddress | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pick = (k: string): string | undefined =>
    typeof r[k] === 'string' ? (r[k] as string) : undefined;
  const street1 = pick('street1') ?? pick('line1');
  const city = pick('city');
  const country = pick('country');
  // Treat "no useful address" as null so the UI can show a clear blocker.
  if (!street1 || !city || !country) return null;
  const addr: ShippingAddress = { street1, city, country };
  const name = pick('name');
  if (name) addr.name = name;
  const street2 = pick('street2') ?? pick('line2');
  if (street2) addr.street2 = street2;
  const state = pick('state') ?? pick('region');
  if (state) addr.state = state;
  const zip = pick('zip') ?? pick('postal_code') ?? pick('postcode');
  if (zip) addr.zip = zip;
  const phone = pick('phone');
  if (phone) addr.phone = phone;
  const email = pick('email');
  if (email) addr.email = email;
  return addr;
}
