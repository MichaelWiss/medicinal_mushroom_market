// Order detail (Cell 3.5).
//
// Server component — loads the order via RLS-bound `loadOrder()` (foreign
// orders return null → notFound()). Status + tracking pill is a client
// island that subscribes to `postgres_changes` on `public.orders` so the
// page reflects ops transitions (confirmed → picking → dispatched) without
// a refresh.

import Link from 'next/link';
import type { Route } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell/PageHeader';
import { loadOrder } from '@/lib/data/orders';
import { OrderRealtime } from './OrderRealtime';

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

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const PAYMENT_LABEL = {
  card: 'Card',
  net30: 'Net-30 invoice',
} as const;

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await loadOrder(id);
  if (order === null) {
    // Either no session or RLS hid the row — distinguish by re-checking
    // auth would require another round-trip; redirect to sign-in for the
    // unauthenticated case is handled by middleware on /orders, so here
    // we treat any null as not-found.
    notFound();
  }
  // Defensive: if middleware ever stops protecting this route, send the
  // anonymous case to sign-in explicitly.
  if (!order) redirect('/sign-in?next=/orders');

  const allocated = order.items.filter((it) => it.batchId).length;

  return (
    <>
      <PageHeader
        label="Account"
        title="Order"
        italicSuffix={order.shortRef}
        description={`Placed ${fmtDateTime(order.createdAt)} · ${PAYMENT_LABEL[order.paymentMethod]}`}
        stat={{ value: fmtGBP(order.totalPrice), label: 'Order total' }}
      />

      <section className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3">
        <OrderRealtime
          orderId={order.id}
          initialStatus={order.status}
          initialTrackingNumber={order.trackingNumber}
        />
        <div className="text-[12px] uppercase tracking-[0.18em] text-ink2">
          Dispatch · <span className="text-ink">{fmtDate(order.dispatchDate)}</span>
        </div>
        <div className="text-[12px] uppercase tracking-[0.18em] text-ink2">
          Allocated · <span className="text-ink">
            {allocated}/{order.items.length}
          </span>
        </div>
        <Link
          href={`/traceability/${order.id}` as Route}
          className="tlink ml-auto"
        >
          View batch traceability →
        </Link>
      </section>

      <div className="tbl-wrap">
        <table className="data-tbl">
          <thead>
            <tr>
              <th>Species</th>
              <th>Format</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Line total</th>
              <th>Batch</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id}>
                <td>
                  <div className="text-ink">{it.speciesCommonName}</div>
                  <div className="text-[11px] italic text-ink2">
                    {it.speciesLatinName}
                  </div>
                </td>
                <td>{it.formatLabel}</td>
                <td>{it.quantity}</td>
                <td>{fmtGBP(it.unitPrice)}</td>
                <td style={{ fontWeight: 400, color: 'var(--ink)' }}>
                  {fmtGBP(it.lineTotal)}
                </td>
                <td>
                  {it.batchId ? (
                    <span className="mono text-[11px]">
                      BCH-{it.batchId.slice(0, 8).toUpperCase()}
                    </span>
                  ) : (
                    <span className="text-[11px] uppercase tracking-[0.18em] text-ink2">
                      Awaiting allocation
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
