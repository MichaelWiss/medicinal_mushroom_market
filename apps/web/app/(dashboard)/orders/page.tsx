// Order history (Cell 3.5).
//
// Server component — lists the signed-in company's orders pulled from
// `loadOrderHistory()`. RLS scopes by company; an unauthenticated caller
// is redirected to /sign-in. Each row links to /orders/[id] for the
// live-updating detail page.

import Link from 'next/link';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell/PageHeader';
import { loadOrderHistory, type OrderStatus } from '@/lib/data/orders';

export const dynamic = 'force-dynamic';

const STATUS_PILL: Record<OrderStatus, string> = {
  pending: 's-con',
  confirmed: 's-con',
  picking: 's-con',
  dispatched: 's-dis',
  delivered: 's-dis',
  cancelled: 's-con',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  picking: 'Picking',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const fmtGBP = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export default async function OrdersPage() {
  const orders = await loadOrderHistory();
  if (orders === null) redirect('/sign-in?next=/orders');

  return (
    <>
      <PageHeader
        label="Account"
        title="Order"
        italicSuffix="history"
        description="Every order placed by your company. Status updates stream in live as ops moves orders through fulfilment."
        stat={{ value: orders.length, label: 'Orders on file' }}
      />

      <div className="tbl-wrap">
        {orders.length === 0 ? (
          <p className="text-[13px] leading-[1.6] text-ink2">
            No orders yet. Add items to your cart from the{' '}
            <Link href={'/' as Route} className="tlink">
              catalogue
            </Link>{' '}
            to place your first order.
          </p>
        ) : (
          <table className="data-tbl">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Placed</th>
                <th>Items</th>
                <th>Format</th>
                <th>Total</th>
                <th>Status</th>
                <th>Track</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="mono">
                    <Link
                      href={`/orders/${o.id}` as Route}
                      className="tlink"
                    >
                      {o.shortRef}
                    </Link>
                  </td>
                  <td>{fmtDate(o.createdAt)}</td>
                  <td>{o.itemsLabel}</td>
                  <td>{o.formatLabel}</td>
                  <td style={{ fontWeight: 400, color: 'var(--ink)' }}>
                    {fmtGBP(o.totalPrice)}
                  </td>
                  <td>
                    <span className={`s-pill ${STATUS_PILL[o.status]}`}>
                      {STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td>
                    {o.trackingNumber ? (
                      <span className="tlink">Track →</span>
                    ) : (
                      '—'
                    )}
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
