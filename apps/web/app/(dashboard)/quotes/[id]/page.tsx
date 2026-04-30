// Buyer quote detail (Cell 5.2). Reads via RLS so unauthorised
// callers see "not found". Renders line items + an Approve button
// when the quote is `sent` and not yet expired.

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { quoteLineItemsSchema, type QuoteLineItemInput } from '@repo/shared';
import { ApproveQuoteButton } from './ApproveQuoteButton';

export const dynamic = 'force-dynamic';

const fmtGBP = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Awaiting your approval',
  approved: 'Approved',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=/quotes/${id}`);

  const { data: quote } = await supabase
    .from('quotes')
    .select('id, status, expires_at, created_at, line_items, company_id, companies(name)')
    .eq('id', id)
    .maybeSingle();
  if (!quote) notFound();

  const parsed = quoteLineItemsSchema.safeParse(quote.line_items);
  const lines: QuoteLineItemInput[] = parsed.success ? parsed.data : [];
  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const expired =
    quote.expires_at !== null &&
    new Date(quote.expires_at).getTime() < Date.now();
  const canApprove = quote.status === 'sent' && !expired;
  const company = quote.companies as { name: string } | null;

  return (
    <section className="px-11 py-10">
      <div className="text-[10px] uppercase tracking-wider5 text-ink3">
        Quote {quote.id.slice(0, 8).toUpperCase()}
      </div>
      <h1 className="mt-2 font-serif text-[28px] font-light italic text-ink">
        {company?.name ?? 'Bulk quote'}
      </h1>
      <div className="mt-4 grid grid-cols-3 gap-6 text-[12px] text-ink2">
        <div>
          <div className="text-[10px] uppercase tracking-wider5 text-ink3">
            Status
          </div>
          <div className="mt-1 text-ink">
            {expired && quote.status === 'sent'
              ? 'Expired'
              : (STATUS_LABEL[quote.status] ?? quote.status)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider5 text-ink3">
            Issued
          </div>
          <div className="mt-1 text-ink">{fmtDate(quote.created_at)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider5 text-ink3">
            Expires
          </div>
          <div className="mt-1 text-ink">{fmtDate(quote.expires_at)}</div>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto border-[3px] border-dotted border-[color:var(--dot)]">
        <table className="w-full text-[12px]">
          <thead className="text-left text-[10px] uppercase tracking-wider5 text-ink3">
            <tr>
              <th className="px-4 py-3">Species</th>
              <th className="px-4 py-3">Format</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr
                key={i}
                className="border-t-[3px] border-dotted border-[color:var(--dot)]"
              >
                <td className="px-4 py-3">{l.speciesName}</td>
                <td className="px-4 py-3">{l.format}</td>
                <td className="px-4 py-3 text-right">{l.quantity}</td>
                <td className="px-4 py-3 text-right">{fmtGBP(l.unitPrice)}</td>
                <td className="px-4 py-3 text-right">
                  {fmtGBP(l.unitPrice * l.quantity)}
                </td>
              </tr>
            ))}
            <tr className="border-t-[3px] border-dotted border-[color:var(--dot)]">
              <td colSpan={4} className="px-4 py-4 text-right text-[10px] uppercase tracking-wider5 text-ink3">
                Total
              </td>
              <td className="px-4 py-4 text-right font-serif text-[18px] italic text-ink">
                {fmtGBP(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <ApproveQuoteButton quoteId={quote.id} disabled={!canApprove} />
        {!canApprove ? (
          <p className="mt-3 text-[12px] text-ink3">
            {expired
              ? 'This quote has expired — please contact your account manager for a refresh.'
              : `Quote is ${quote.status}; only sent quotes can be approved.`}
          </p>
        ) : null}
      </div>
    </section>
  );
}
