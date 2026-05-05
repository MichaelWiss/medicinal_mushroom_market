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
  type CompanyTier,
} from '@repo/shared';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateCart } from '@/lib/checkout/validate-cart';
import { allocateOrderLines } from '@/lib/checkout/allocate-order';
import { requireCompany } from '@/lib/auth/require-company';
import { getCompanyEmails } from '@/lib/email/recipients';
import { InvoicePdf, type InvoiceLine } from '@/lib/invoices/InvoicePdf';
import { sendInvoice } from '@/lib/email/send';
import { orderUrl as buildOrderUrl } from '@/lib/email/send';
import {
  formatShippingAddress,
  parseShippingAddress,
} from '@/lib/data/shipping-address';
import { formatLabel } from '@/lib/data/labels';
import { invoiceRef } from '@/lib/format/refs';
import { track } from '@/lib/posthog/track';

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

  const ctx = await requireCompany();
  if (!ctx.ok) {
    return {
      ok: false,
      code: ctx.code === 'unauthenticated' ? 'unauthenticated' : 'no_company',
      error:
        ctx.code === 'unauthenticated' ? 'Sign in to check out.' : ctx.error,
    };
  }
  if (!ctx.email) {
    return { ok: false, code: 'unauthenticated', error: 'Sign in to check out.' };
  }
  const { userId, email: userEmail, companyId, tier } = ctx;

  const supabase = await createClient();

  // Net-30 needs the company name + address + eligibility flag, which the
  // shared `requireCompany` helper does not load. Pull them now.
  const { data: companyRow, error: companyErr } = await supabase
    .from('companies')
    .select('id, name, net30_enabled, shipping_address')
    .eq('id', companyId)
    .maybeSingle();
  if (companyErr || !companyRow) {
    return { ok: false, code: 'db_error', error: 'Company lookup failed.' };
  }
  if (!companyRow.net30_enabled) {
    return {
      ok: false,
      code: 'not_eligible',
      error: 'Net-30 payment is not enabled for this account.',
    };
  }
  const company = {
    id: companyRow.id,
    name: companyRow.name,
    net30_enabled: companyRow.net30_enabled,
    shipping_address: parseShippingAddress(companyRow.shipping_address),
  };

  // Validate stock + dispatch window + resolve trusted lines.
  const validation = await validateCart(supabase, items, dispatchDate);
  if (!validation.ok) {
    return { ok: false, code: validation.code, error: validation.error };
  }
  const { trustedLines } = validation;

  // Compute discounted unit prices + total from the trusted lines.
  const linePrices = trustedLines.map((l) => {
    const lineTotal = calculateLinePrice(l.unitPricePence, l.quantity, tier);
    return {
      ...l,
      unitPriceDiscounted: Math.round(lineTotal / l.quantity),
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
  const allocation = await allocateOrderLines(
    admin,
    order.id,
    linePrices.map((l) => ({
      speciesId: l.speciesId,
      speciesName: l.speciesName,
      format: l.format,
      quantity: l.quantity,
      unitPrice: l.unitPriceDiscounted,
    })),
  );
  if (!allocation.ok) {
    return { ok: false, code: allocation.code, error: allocation.error };
  }

  // Render invoice PDF + send email. Best-effort; failures here do
  // NOT roll back the confirmed order — ops can resend the invoice.
  const invoiceNumber = invoiceRef(order.id);
  const issuedDate = new Date(order.created_at).toISOString().slice(0, 10);
  const due = new Date(order.created_at);
  due.setUTCDate(due.getUTCDate() + 30);
  const dueDate = due.toISOString().slice(0, 10);

  const invoiceLines: InvoiceLine[] = linePrices.map((l) => ({
    speciesName: l.speciesName,
    formatLabel: formatLabel(l.format),
    quantity: l.quantity,
    unitPricePence: l.unitPriceDiscounted,
  }));

  try {
    const pdfBuffer = await renderToBuffer(
      InvoicePdf({
        invoiceNumber,
        orderId: order.id,
        companyName: company.name,
        buyerEmail: userEmail,
        issuedDate,
        dueDate,
        lines: invoiceLines,
        totalPence: totalPrice,
        shippingAddress: formatShippingAddress(company.shipping_address),
      }),
    );
    const pdfBase64 = pdfBuffer.toString('base64');
    const recipients = await getCompanyEmails(companyId);
    for (const to of recipients.length > 0 ? recipients : [userEmail]) {
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
  // Net-30 confirms inline (no Stripe round-trip), so emit both events.
  track(
    'checkout_started',
    userId,
    {
      orderId: order.id,
      paymentMethod: 'net30',
      totalPence: totalPrice,
      lineItemCount: invoiceLines.length,
    },
    { companyId },
  );
  track(
    'checkout_completed',
    userId,
    {
      orderId: order.id,
      paymentMethod: 'net30',
      totalPence: totalPrice,
      lineItemCount: invoiceLines.length,
    },
    { companyId },
  );
  return { ok: true, orderId: order.id, invoiceNumber };
}


// `getCompanyEmails` is imported from `lib/email/recipients` above.
