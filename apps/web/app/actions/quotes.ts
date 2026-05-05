// Quote workflow Server Actions (Cell 5.2).
//
//   • createQuote   — admin builds a quote (status='draft' or 'sent')
//   • sendQuote     — admin transitions draft → sent + emails the buyer
//   • approveQuote  — buyer accepts; converts to a confirmed order with
//                     batches allocated. No Stripe (price already
//                     negotiated). Net-30 if the company is enabled,
//                     otherwise card (left for ops to invoice manually).
//
// Permissioning: the admin actions require the caller's
// `company_users.role` to be `'admin'` for the quote's company.
// The DB's RLS already scopes by `company_id`; this is the second
// guard against cross-company writes.

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { quoteLineItemsSchema } from '@repo/shared';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCompanyAdmin } from '@/lib/auth/require-company';
import { getSiteUrl } from '@/lib/auth/origin';
import { allocateOrderLines } from '@/lib/checkout/allocate-order';
import { getCompanyEmails } from '@/lib/email/recipients';
import { sendQuote as sendQuoteEmail, orderUrl } from '@/lib/email/send';


const createSchema = z.object({
  companyId: z.string().uuid(),
  lineItems: quoteLineItemsSchema,
  /** ISO date; defaults to +14 days. */
  expiresAt: z.string().datetime().optional(),
  /** When true, immediately set status='sent' and email the buyer. */
  send: z.boolean().default(false),
});

export type CreateQuoteInput = z.infer<typeof createSchema>;

export type CreateQuoteResult =
  | { ok: true; quoteId: string; status: 'draft' | 'sent' }
  | { ok: false; error: string };

export async function createQuote(
  raw: CreateQuoteInput,
): Promise<CreateQuoteResult> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid quote payload.' };
  const { companyId, lineItems, expiresAt, send } = parsed.data;

  const guard = await requireCompanyAdmin(companyId);
  if (!guard.ok) return { ok: false, error: guard.error };

  const expiry =
    expiresAt ??
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const admin = createAdminClient();
  const { data: quote, error } = await admin
    .from('quotes')
    .insert({
      company_id: companyId,
      line_items: lineItems,
      status: send ? 'sent' : 'draft',
      expires_at: expiry,
    })
    .select('id, status')
    .single();
  if (error || !quote) {
    return { ok: false, error: error?.message ?? 'Could not create quote.' };
  }

  if (send) {
    await emailQuoteToBuyer(companyId, quote.id, expiry);
  }
  revalidatePath('/console/quotes');
  return { ok: true, quoteId: quote.id, status: quote.status as 'draft' | 'sent' };
}

export async function sendQuote(quoteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: quote, error: qErr } = await admin
    .from('quotes')
    .select('id, company_id, status, expires_at')
    .eq('id', quoteId)
    .maybeSingle();
  if (qErr || !quote) return { ok: false, error: 'Quote not found.' };

  const guard = await requireCompanyAdmin(quote.company_id);
  if (!guard.ok) return { ok: false, error: guard.error };

  if (quote.status !== 'draft') {
    return { ok: false, error: `Quote is ${quote.status}; only draft quotes can be sent.` };
  }

  const { error: updErr } = await admin
    .from('quotes')
    .update({ status: 'sent' })
    .eq('id', quoteId);
  if (updErr) return { ok: false, error: updErr.message };

  await emailQuoteToBuyer(quote.company_id, quoteId, quote.expires_at);
  revalidatePath('/console/quotes');
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true };
}

export type ApproveQuoteResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; code: ApproveQuoteErrorCode };

export type ApproveQuoteErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'invalid_state'
  | 'expired'
  | 'allocation_failed'
  | 'db_error';

export async function approveQuote(quoteId: string): Promise<ApproveQuoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: 'unauthenticated', error: 'Sign in required.' };
  }

  // Read the quote via RLS — buyer must belong to its company.
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select('id, company_id, line_items, status, expires_at')
    .eq('id', quoteId)
    .maybeSingle();
  if (qErr || !quote) {
    return { ok: false, code: 'not_found', error: 'Quote not found.' };
  }
  if (quote.status !== 'sent') {
    return {
      ok: false,
      code: 'invalid_state',
      error: `Quote status is ${quote.status}; only sent quotes can be approved.`,
    };
  }
  if (quote.expires_at && new Date(quote.expires_at).getTime() < Date.now()) {
    // Best-effort flip to expired so the UI updates.
    const admin = createAdminClient();
    await admin.from('quotes').update({ status: 'expired' }).eq('id', quoteId);
    return { ok: false, code: 'expired', error: 'Quote has expired.' };
  }

  const lineItems = quoteLineItemsSchema.safeParse(quote.line_items);
  if (!lineItems.success) {
    return { ok: false, code: 'db_error', error: 'Quote line items are malformed.' };
  }

  // Resolve company tier + net30 eligibility for payment_method choice.
  const { data: company, error: cErr } = await supabase
    .from('companies')
    .select('id, net30_enabled')
    .eq('id', quote.company_id)
    .maybeSingle();
  if (cErr || !company) {
    return { ok: false, code: 'db_error', error: 'Company not found.' };
  }

  const totalPrice = lineItems.data.reduce(
    (s, l) => s + l.unitPrice * l.quantity,
    0,
  );
  const dispatchDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const paymentMethod = company.net30_enabled ? 'net30' : 'card';

  const admin = createAdminClient();
  const { data: order, error: orderErr } = await admin
    .from('orders')
    .insert({
      company_id: quote.company_id,
      status: 'confirmed',
      payment_method: paymentMethod,
      dispatch_date: dispatchDate,
      total_price: totalPrice,
    })
    .select('id')
    .single();
  if (orderErr || !order) {
    return {
      ok: false,
      code: 'db_error',
      error: orderErr?.message ?? 'Could not create order.',
    };
  }

  const allocation = await allocateOrderLines(
    admin,
    order.id,
    lineItems.data.map((l) => ({
      speciesId: l.speciesId,
      speciesName: l.speciesName,
      format: l.format,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
  );
  if (!allocation.ok) {
    return { ok: false, code: allocation.code, error: allocation.error };
  }

  await admin
    .from('quotes')
    .update({ status: 'approved' })
    .eq('id', quoteId);

  revalidatePath('/orders');
  revalidatePath('/quotes');
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true, orderId: order.id };
}

async function emailQuoteToBuyer(
  companyId: string,
  quoteId: string,
  expiresAt: string | null,
): Promise<void> {
  const recipients = await getCompanyEmails(companyId);
  if (recipients.length === 0) {
    console.warn('[quotes] no recipients for company', companyId);
    return;
  }
  const url = `${getSiteUrl()}/quotes/${quoteId}`;
  for (const to of recipients) {
    await sendQuoteEmail(to, {
      quoteRef: quoteId,
      quoteUrl: url,
      expiresAt: expiresAt ?? null,
    });
  }
}

// Re-export so callers don't have to import two modules.
export { orderUrl };
