// Admin quote list (Cell 5.2). Lists every quote across all
// companies. Service-role read since the operator doesn't belong
// to a single company. Real ops would gate by app role; for now
// we lean on the route being under the (admin) group + the
// underlying actions re-checking admin role per company.

import Link from 'next/link';
import type { Route } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default async function AdminQuotesPage() {
  const admin = createAdminClient();
  const { data: quotes } = await admin
    .from('quotes')
    .select('id, status, expires_at, created_at, company_id, line_items, companies(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <section className="px-11 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-[28px] font-light italic text-ink">
          Quotes
        </h1>
        <Link
          href={'/console/quotes/new' as Route}
          className="bg-yellow px-5 py-2.5 font-sans text-[10px] uppercase tracking-wider3 text-navy transition-colors hover:bg-yellow2"
        >
          New quote →
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto border-[3px] border-dotted border-[color:var(--dot)]">
        <table className="w-full text-[12px]">
          <thead className="text-left text-[10px] uppercase tracking-wider5 text-ink3">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Lines</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {(quotes ?? []).map((q) => {
              const company = q.companies as { name: string } | null;
              const items = Array.isArray(q.line_items) ? q.line_items.length : 0;
              return (
                <tr
                  key={q.id}
                  className="border-t-[3px] border-dotted border-[color:var(--dot)]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/quotes/${q.id}` as Route}
                      className="tlink"
                    >
                      {q.id.slice(0, 8).toUpperCase()}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{company?.name ?? '—'}</td>
                  <td className="px-4 py-3">{items}</td>
                  <td className="px-4 py-3">{STATUS_LABEL[q.status] ?? q.status}</td>
                  <td className="px-4 py-3">{fmtDate(q.expires_at)}</td>
                  <td className="px-4 py-3">{fmtDate(q.created_at)}</td>
                </tr>
              );
            })}
            {!quotes || quotes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink3">
                  No quotes yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
