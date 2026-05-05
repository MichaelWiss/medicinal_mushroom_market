// Picking → Dispatched workflow Server Actions (Cell 6.2).
//
//   • markOrderPicking(orderId)        — confirmed → picking
//   • generateLabelForOrder(orderId)   — picking only; calls Shippo,
//                                        sets tracking_number, transitions
//                                        to dispatched, fires email + opts
//                                        the parcel into Shippo's webhook
//                                        fan-out for Cell 6.3.
//
// State guards delegate to `canTransitionOrder` from `@repo/shared/state`.
//
// Authorisation: `/console/**` is in `PROTECTED_PREFIXES` so middleware
// already blocks anonymous callers. Real "ops role" provisioning is out
// of scope for v1 — these actions re-verify a session and rely on the
// route group + service-role boundary (mirrors the Cell 5.2 quotes admin).

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { canTransitionOrder } from '@repo/shared';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOps } from '@/lib/auth/require-ops';
import { createLabel, type ShippoAddress } from '@/lib/shippo/labels';
import { registerTracking } from '@/lib/shippo/tracking';
import { ShippoError } from '@/lib/shippo/client';
import { getCompanyEmails } from '@/lib/email/recipients';
import { sendDispatchNotice, orderUrl } from '@/lib/email/send';
import { parseShippingAddress } from '@/lib/data/shipping-address';
import { orderRef } from '@/lib/format/refs';
import type { ShippingAddress } from '@repo/shared';

export type DispatchActionResult =
  | { ok: true; status: string; trackingNumber?: string; labelUrl?: string }
  | { ok: false; error: string; code?: string };


export async function markOrderPicking(
  orderId: string,
): Promise<DispatchActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: current, error: readErr } = await admin
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) return { ok: false, error: 'Order not found.' };

  if (!canTransitionOrder(current.status, 'picking')) {
    return {
      ok: false,
      error: `Cannot move ${current.status} → picking.`,
      code: 'invalid_transition',
    };
  }

  // Predicate on current status to defeat concurrent transitions.
  const { data: updated, error: updErr } = await admin
    .from('orders')
    .update({ status: 'picking' })
    .eq('id', orderId)
    .eq('status', current.status)
    .select('id, status')
    .maybeSingle();
  if (updErr) return { ok: false, error: updErr.message };
  if (!updated) {
    return {
      ok: false,
      error: 'Order status changed concurrently. Refresh and try again.',
      code: 'race',
    };
  }

  revalidatePath(`/console/orders/${orderId}`);
  revalidatePath('/console/orders');
  return { ok: true, status: updated.status };
}

export type GenerateLabelInput = {
  orderId: string;
  /** Optional override; defaults to a 12×10×6 in / 5 lb cold-chain box. */
  parcel?: {
    length: number;
    width: number;
    height: number;
    distanceUnit: 'in' | 'cm';
    weight: number;
    massUnit: 'lb' | 'kg' | 'oz' | 'g';
  };
  servicelevelToken?: string;
  carrierAccount?: string;
};

const DEFAULT_PARCEL = {
  length: 12,
  width: 10,
  height: 6,
  distanceUnit: 'in' as const,
  weight: 5,
  massUnit: 'lb' as const,
};

function readWarehouseAddress(): ShippoAddress | null {
  const street1 = process.env.WAREHOUSE_STREET1;
  const city = process.env.WAREHOUSE_CITY;
  const state = process.env.WAREHOUSE_STATE;
  const zip = process.env.WAREHOUSE_ZIP;
  const country = process.env.WAREHOUSE_COUNTRY;
  if (!street1 || !city || !state || !zip || !country) return null;
  const addr: ShippoAddress = {
    name: process.env.WAREHOUSE_NAME ?? 'Mycelium Supply Co.',
    street1,
    city,
    state,
    zip,
    country,
  };
  if (process.env.WAREHOUSE_STREET2) addr.street2 = process.env.WAREHOUSE_STREET2;
  if (process.env.WAREHOUSE_PHONE) addr.phone = process.env.WAREHOUSE_PHONE;
  if (process.env.WAREHOUSE_EMAIL) addr.email = process.env.WAREHOUSE_EMAIL;
  return addr;
}

function shippingAddressToShippo(
  addr: ShippingAddress,
  fallbackName: string,
): ShippoAddress | null {
  if (!addr.street1 || !addr.city || !addr.country) return null;
  const out: ShippoAddress = {
    name: addr.name ?? fallbackName,
    street1: addr.street1,
    city: addr.city,
    state: addr.state ?? '',
    zip: addr.zip ?? '',
    country: addr.country,
  };
  if (addr.street2) out.street2 = addr.street2;
  if (addr.phone) out.phone = addr.phone;
  if (addr.email) out.email = addr.email;
  return out;
}

export async function generateLabelForOrder(
  input: GenerateLabelInput,
): Promise<DispatchActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: order, error: readErr } = await admin
    .from('orders')
    .select(
      `id, status, dispatch_date, company_id, tracking_number,
       companies:company_id ( name, shipping_address )`,
    )
    .eq('id', input.orderId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!order) return { ok: false, error: 'Order not found.' };

  if (!canTransitionOrder(order.status, 'dispatched')) {
    return {
      ok: false,
      error: `Order must be in 'picking' to generate a label (current: ${order.status}).`,
      code: 'invalid_transition',
    };
  }

  const company = order.companies as
    | { name: string; shipping_address: unknown }
    | null;
  const shippingAddress = parseShippingAddress(company?.shipping_address);

  const fromAddress = readWarehouseAddress();
  if (!fromAddress) {
    return {
      ok: false,
      error:
        'Warehouse address not configured. Set WAREHOUSE_* env vars in apps/web/.env.local.',
      code: 'missing_warehouse',
    };
  }

  const toAddress = shippingAddress
    ? shippingAddressToShippo(shippingAddress, company?.name ?? 'Customer')
    : null;
  if (!toAddress) {
    return {
      ok: false,
      error: 'Customer shipping address is missing required fields.',
      code: 'missing_address',
    };
  }

  let label;
  try {
    label = await createLabel({
      from: fromAddress,
      to: toAddress,
      parcel: input.parcel ?? DEFAULT_PARCEL,
      orderId: order.id,
      coldChain: true,
      ...(input.servicelevelToken
        ? { servicelevelToken: input.servicelevelToken }
        : {}),
      ...(input.carrierAccount ? { carrierAccount: input.carrierAccount } : {}),
    });
  } catch (err) {
    if (err instanceof ShippoError) {
      return {
        ok: false,
        error: err.message,
        code: 'shippo_error',
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Label generation failed.',
      code: 'shippo_error',
    };
  }

  // Predicate on `status='picking'` so a stale tab cannot accidentally
  // rewind the order or double-dispatch.
  const { data: updated, error: updErr } = await admin
    .from('orders')
    .update({
      status: 'dispatched',
      tracking_number: label.trackingNumber,
    })
    .eq('id', order.id)
    .eq('status', 'picking')
    .select('id, status, tracking_number')
    .maybeSingle();
  if (updErr) return { ok: false, error: updErr.message };
  if (!updated) {
    return {
      ok: false,
      error:
        'Label generated but order was no longer in picking. Investigate manually.',
      code: 'race',
    };
  }

  // Best-effort tracking opt-in (so /api/webhooks/shippo gets events).
  try {
    await registerTracking({
      carrier: label.carrier,
      trackingNumber: label.trackingNumber,
      metadata: JSON.stringify({ order_id: order.id }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[dispatch] registerTracking failed for ${order.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // Best-effort dispatch email fan-out.
  try {
    const recipients = await getCompanyEmails(order.company_id);
    await Promise.all(
      recipients.map((to) =>
        sendDispatchNotice(to, {
          orderRef: orderRef(order.id),
          trackingNumber: label.trackingNumber,
          dispatchDate: order.dispatch_date,
          orderUrl: orderUrl(order.id),
        }),
      ),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[dispatch] dispatch email send failed for ${order.id}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  revalidatePath(`/console/orders/${order.id}`);
  revalidatePath('/console/orders');
  revalidatePath(`/orders/${order.id}`);
  const result: DispatchActionResult = {
    ok: true,
    status: updated.status,
    labelUrl: label.labelUrl,
  };
  if (updated.tracking_number) result.trackingNumber = updated.tracking_number;
  return result;
}
