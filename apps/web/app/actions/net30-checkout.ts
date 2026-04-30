// Net-30 checkout Server Action (Cell 5.1).
//
// Mirrors `startCheckout` (Cell 3.3) but bypasses Stripe and writes
// the order directly as `confirmed` with `payment_method='net30'`.
// Allocates batches via `allocate_batch` immediately (so stock is
// reserved on confirmation, just as the card webhook does after
// payment).
//
// Eligibility:
//   - Buyer must be signed in.
//   - The buyer's `companies.net30_enabled` must be `true`. The
//     server checks this explicitly and the BEFORE-INSERT trigger
//     `net30_guard` is the second line of defence.
//
// Side effects on success:
//   - Renders an invoice PDF via `@react-pdf/renderer`.
//   - Emails it (best-effort; logged-only when `RESEND_API_KEY` is
//     unset) to all `company_users` addresses.

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  cartSchema,
  calculateLinePrice,
  type CartItemInput,
  type CompanyTier,
} from '@repo/shared';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDispatchAllowed } from '@/lib/checkout/dispatch';
import { InvoicePdf, type InvoiceLine } from '@/lib/invoices/InvoicePdf';
import { sendInvoice } from '@/lib/email/send';
import { orderUrl as buildOrderUrl } from '@/lib/email/send';

const inputSchema = z.object({
  items: cartSchema,
  dispatchDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type Net30CheckoutInput = z.infer<typeof inputSchema>;

export type Net30CheckoutResult =
  | { ok: true; orderId: string; invoiceNumber: string }
  | { ok: false; error: string; code: Net30ErrorCode };

export type Net30ErrorCode =
  | 'unauthenticated'
  | 'no_company'
  | 'not_eligible'
  | 'invalid_input'
  | 'empty_cart'
  | 'insufficient_stock'
  | 'invalid_dispatch_date'
  | 'allocation_failed'
  | 'db_error';

const FORMAT_LABEL: Record<CartItemInput['format'], string> = {
  fresh: 'Fresh fruiting body',
  powder: 'Dried powder',
  spawn: 'Grain spawn',
  culture: 'Liquid culture',
  block: 'Substrate block',
};

export async function startNet30Checkout(
  raw: Net30CheckoutInput,
): Promise<Net30CheckoutResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input', error: 'Invalid checkout payload.' };
  }
  const { items, dispatchDate } = parsed.data;
  if (items.length === 0) {
    return { ok: false, code: 'empty_cart', error: 'Cart is empty.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return { ok: false, code: 'unauthenticated', error: 'Sign in to check out.' };
  }

  const { data: membership, error: memErr } = await supabase
    .from('company_users')
    .select('company_id, companies(id, name, tier, net30_enabled, shipping_address)')
    .eq('user_id', user.id)
    .maybeSingle();
  if (memErr || !membership?.company_id) {
    return { ok: false, code: 'no_company', error: 'No company linked to this account.' };
  }
  const company = membership.companies as {
    id: string;
    name: string;
    tier: CompanyTier;
    net30_enabled: boolean;
    shipping_address: Record<string, unknown> | null;
  } | null;
  if (!company?.net30_enabled) {
    return {
      ok: false,
      code: 'not_eligible',
      error: 'Net-30 payment is not enabled for this account.',
    };
  }
  const companyId = membership.company_id;
  const tier = (company.tier ?? 'spot') as CompanyTier;

  // Validate stock + dispatch window.
  const speciesIds = Array.from(new Set(items.map((i) => i.speciesId)));
  const [{ data: speciesRows, error: spErr }, { data: batchRows, error: bErr }] =
    await Promise.all([
      supabase
        .from('species')
        .select('id, common_name, dispatch_window')
        .in('id', speciesIds),
      supabase
        .from('batches')
        .select('species_id, available_units, contamination_check')
        .in('species_id', speciesIds)
        .eq('contamination_check', 'pass'),
    ]);
  if (spErr || bErr || !speciesRows) {
    return { ok: false, code: 'db_error', error: 'Could not validate cart.' };
  }
  const speciesById = new Map(speciesRows.map((s) => [s.id, s]));
  const stockBySpecies = new Map<string, number>();
  for (const b of batchRows ?? []) {
    stockBySpecies.set(
      b.species_id,
      (stockBySpecies.get(b.species_id) ?? 0) + (b.available_units ?? 0),
    );
  }
  const dispatchUTC = new Date(`${dispatchDate}T00:00:00.000Z`);
  if (Number.isNaN(dispatchUTC.getTime())) {
    return { ok: false, code: 'invalid_dispatch_date', error: 'Invalid dispatch date.' };
  }
  const requestedBySpecies = new Map<string, number>();
  for (const it of items) {
    requestedBySpecies.set(
      it.speciesId,
      (requestedBySpecies.get(it.speciesId) ?? 0) + it.quantity,
    );
  }
  for (const [sid, qty] of requestedBySpecies) {
    const sp = speciesById.get(sid);
    if (!sp) {
      return { ok: false, code: 'invalid_input', error: 'Unknown species in cart.' };
    }
    const stock = stockBySpecies.get(sid) ?? 0;
    if (stock < qty) {
      return {
        ok: false,
        code: 'insufficient_stock',
        error: `Insufficient stock for ${sp.common_name}. Available: ${stock}.`,
      };
    }
    if (!isDispatchAllowed(sp.dispatch_window, dispatchUTC)) {
      return {
        ok: false,
        code: 'invalid_dispatch_date',
        error: `${sp.common_name} cannot dispatch on the selected date.`,
      };
    }
  }

  // Compute discounted unit prices + total.
  const linePrices = items.map((it) => {
    const lineTotal = calculateLinePrice(it.unitPrice, it.quantity, tier);
    return {
      ...it,
      unitPriceDiscounted: Math.round(lineTotal / it.quantity),
      lineTotal,
    };
  });
  const totalPrice = linePrices.reduce((sum, l) => sum + l.lineTotal, 0);

  // Insert order as confirmed (Net-30 needs no payment intent).
  const admin = createAdminClient();
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      company_id: companyId,
      status: 'confirmed',
      payment_method: 'net30',
      dispatch_date: dispatchDate,
      total_price: totalPrice,
    })
    .select('id, created_at')
    .single();
  if (orderErr || !order) {
    return {
      ok: false,
      code: 'db_error',
      error: orderErr?.message ?? 'Could not create order.',
    };
  }

  // Allocate stock per line up-front and write order_items.
  for (const line of linePrices) {
    const { data: batchId, error: allocErr } = await admin.rpc('allocate_batch', {
      p_species_id: line.speciesId,
      p_qty: line.quantity,
    });
    if (allocErr || !batchId) {
      // Rollback: best effort. Delete order_items + order.
      await admin.from('order_items').delete().eq('order_id', order.id);
      await admin.from('orders').delete().eq('id', order.id);
      return {
        ok: false,
        code: 'allocation_failed',
        error:
          allocErr?.message ??
          `Allocation failed for ${line.speciesName}. Stock may have shifted.`,
      };
    }
    const { error: itemErr } = await admin.from('order_items').insert({
      order_id: order.id,
      species_id: line.speciesId,
      batch_id: batchId,
      format: line.format,
      quantity: line.quantity,
      unit_price: line.unitPriceDiscounted,
      allocated_at: new Date().toISOString(),
    });
    if (itemErr) {
      await admin.from('order_items').delete().eq('order_id', order.id);
      await admin.from('orders').delete().eq('id', order.id);
      return {
        ok: false,
        code: 'db_error',
        error: `Could not write order line: ${itemErr.message}`,
      };
    }
  }

  // Render invoice PDF + send email. Best-effort; failures here do
  // NOT roll back the confirmed order — ops can resend the invoice.
  const invoiceNumber = `INV-${order.id.slice(0, 8).toUpperCase()}`;
  const issuedDate = new Date(order.created_at).toISOString().slice(0, 10);
  const due = new Date(order.created_at);
  due.setUTCDate(due.getUTCDate() + 30);
  const dueDate = due.toISOString().slice(0, 10);

  const invoiceLines: InvoiceLine[] = linePrices.map((l) => ({
    speciesName: l.speciesName,
    formatLabel: FORMAT_LABEL[l.format],
    quantity: l.quantity,
    unitPricePence: l.unitPriceDiscounted,
  }));

  try {
    const pdfBuffer = await renderToBuffer(
      InvoicePdf({
        invoiceNumber,
        orderId: order.id,
        companyName: company.name,
        buyerEmail: user.email,
        issuedDate,
        dueDate,
        lines: invoiceLines,
        totalPence: totalPrice,
        shippingAddress: formatShippingAddress(company.shipping_address),
      }),
    );
    const pdfBase64 = pdfBuffer.toString('base64');
    const recipients = await getCompanyEmails(companyId);
    for (const to of recipients.length > 0 ? recipients : [user.email]) {
      await sendInvoice(
        to,
        {
          invoiceNumber,
          orderRef: order.id,
          totalPrice,
          dueDate,
          orderUrl: buildOrderUrl(order.id),
        },
        pdfBase64,
        `${invoiceNumber}.pdf`,
      );
    }
  } catch (err) {
    console.error('[net30] invoice render/send failed', {
      orderId: order.id,
      message: err instanceof Error ? err.message : err,
    });
  }

  revalidatePath('/orders');
  return { ok: true, orderId: order.id, invoiceNumber };
}

function formatShippingAddress(addr: Record<string, unknown> | null): string | undefined {
  if (!addr || typeof addr !== 'object') return undefined;
  const parts = ['line1', 'line2', 'city', 'postcode', 'country']
    .map((k) => (addr as Record<string, unknown>)[k])
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

async function getCompanyEmails(companyId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: links } = await admin
    .from('company_users')
    .select('user_id')
    .eq('company_id', companyId);
  const out: string[] = [];
  for (const link of links ?? []) {
    const { data } = await admin.auth.admin.getUserById(link.user_id);
    if (data?.user?.email) out.push(data.user.email);
  }
  return out;
}
