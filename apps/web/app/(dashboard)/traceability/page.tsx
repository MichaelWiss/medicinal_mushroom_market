// Traceability order index (Cell 2.6).
//
// Lists the signed-in company's orders. RLS scopes the rows automatically;
// each row links to `/traceability/[orderId]` for the batch detail view.

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell/PageHeader';
import { loadOrderIndex } from '@/lib/data/traceability';

export const dynamic = 'force-dynamic';

const fmtGBP = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const STATUS_PILL: Record<string, string> = {
  pending: 's-con',
  confirmed: 's-con',
  picking: 's-con',
  dispatched: 's-dis',
  delivered: 's-dis',
  cancelled: 's-con',
};

export default async function TraceabilityIndexPage() {
  const orders = await loadOrderIndex();
  if (orders === null) redirect('/sign-in?next=/traceability');

  return (
    <>
      <PageHeader
        label="Account"
        title="Batch"
        italicSuffix="traceability"
        description="Pick an order to view inoculation, harvest, and contamination records for every allocated batch."
        stat={{ value: orders.length, label: 'Orders on file' }}
      />

      <div className="tbl-wrap">
        {orders.length === 0 ? (
          <p className="text-[13px] leading-[1.6] text-ink2">
            No orders yet. Once your first order is confirmed, batch
            traceability records appear here.
          </p>
        ) : (
          <table className="data-tbl">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Dispatch</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.shortRef}</td>
                  <td>{o.dispatchDate ?? '—'}</td>
                  <td>{o.itemCount}</td>
                  <td style={{ fontWeight: 400, color: 'var(--ink)' }}>
                    {fmtGBP(o.totalPrice)}
                  </td>
                  <td>
                    <span
                      className={`s-pill ${STATUS_PILL[o.status] ?? 's-con'}`}
                    >
                      {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/traceability/${o.id}` as Route}
                      className="tlink"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
