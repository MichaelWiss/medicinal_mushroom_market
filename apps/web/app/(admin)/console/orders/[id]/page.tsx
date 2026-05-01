// Admin order detail (Cell 6.2). Service-role read so ops can see
// any order without belonging to a buyer company.
//
// State walks: confirmed → [Mark picking] → picking → [Generate label]
// → dispatched. The Cell 6.3 Shippo webhook completes the journey to
// `delivered`.

import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import { loadAdminOrder } from '@/lib/data/admin-orders';
import { OrderDispatchActions } from './OrderDispatchActions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  picking: 'Picking',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
} as const;

const PAYMENT_LABEL = {
  card: 'Card',
  net30: 'Net-30 invoice',
} as const;

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

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await loadAdminOrder(id);
  if (!order) notFound();

  const allocated = order.items.filter((it) => it.batchId).length;
  const addr = order.shippingAddress;

  return (
    <section className="px-11 py-10">
      <div className="text-[10px] uppercase tracking-wider5 text-ink3">
        <Link href={'/console/orders' as Route} className="tlink">
          ← Orders
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-serif text-[28px] font-light italic text-ink">
          {order.shortRef}
        </h1>
        <div className="text-[12px] uppercase tracking-wider3 text-ink2">
          Status · <span className="text-ink">{STATUS_LABEL[order.status]}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="border-[3px] border-dotted border-[color:var(--dot)] p-5">
            <div className="text-[10px] uppercase tracking-wider5 text-ink3">
              Customer
            </div>
            <div className="mt-2 text-[14px] text-ink">{order.companyName}</div>
            {addr ? (
              <address className="mt-2 not-italic text-[12px] leading-relaxed text-ink2">
                {addr.name ? <div>{addr.name}</div> : null}
                <div>{addr.street1}</div>
                {addr.street2 ? <div>{addr.street2}</div> : null}
                <div>
                  {[addr.city, addr.state, addr.zip]
                    .filter(Boolean)
                    .join(', ')}
                </div>
                <div>{addr.country}</div>
                {addr.phone ? <div className="mt-1">☎ {addr.phone}</div> : null}
              </address>
            ) : (
              <div className="mt-2 text-[12px] text-amber-700">
                Shipping address missing or incomplete.
              </div>
            )}
          </div>

          <div className="overflow-x-auto border-[3px] border-dotted border-[color:var(--dot)]">
            <table className="w-full text-[12px]">
              <thead className="text-left text-[10px] uppercase tracking-wider5 text-ink3">
                <tr>
                  <th className="px-4 py-3">Species</th>
                  <th className="px-4 py-3">Format</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Line total</th>
                  <th className="px-4 py-3">Batch</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr
                    key={it.id}
                    className="border-t-[3px] border-dotted border-[color:var(--dot)]"
                  >
                    <td className="px-4 py-3">
                      <div className="text-ink">{it.speciesCommonName}</div>
                      <div className="text-[11px] italic text-ink2">
                        {it.speciesLatinName}
                      </div>
                    </td>
                    <td className="px-4 py-3">{it.formatLabel}</td>
                    <td className="px-4 py-3">{it.quantity}</td>
                    <td className="px-4 py-3">{fmtGBP(it.unitPrice)}</td>
                    <td className="px-4 py-3">{fmtGBP(it.lineTotal)}</td>
                    <td className="px-4 py-3">
                      {it.batchId ? (
                        <span className="mono text-[11px]">
                          BCH-{it.batchId.slice(0, 8).toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-[11px] uppercase tracking-wider3 text-ink2">
                          Unallocated
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="space-y-6">
          <OrderDispatchActions
            orderId={order.id}
            status={order.status}
            hasShippingAddress={Boolean(addr)}
          />

          <div className="border-[3px] border-dotted border-[color:var(--dot)] p-5">
            <div className="text-[10px] uppercase tracking-wider5 text-ink3">
              Summary
            </div>
            <dl className="mt-3 space-y-2 text-[12px]">
              <div className="flex justify-between">
                <dt className="text-ink2">Total</dt>
                <dd className="text-ink">{fmtGBP(order.totalPrice)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink2">Payment</dt>
                <dd className="text-ink">{PAYMENT_LABEL[order.paymentMethod]}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink2">Dispatch date</dt>
                <dd className="text-ink">{fmtDate(order.dispatchDate)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink2">Allocated</dt>
                <dd className="text-ink">
                  {allocated}/{order.items.length}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink2">Tracking</dt>
                <dd className="text-ink">
                  {order.trackingNumber ? (
                    <span className="mono">{order.trackingNumber}</span>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink2">Placed</dt>
                <dd className="text-ink">{fmtDateTime(order.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink2">Updated</dt>
                <dd className="text-ink">{fmtDateTime(order.updatedAt)}</dd>
              </div>
            </dl>
          </div>

          <Link
            href={`/traceability/${order.id}` as Route}
            className="tlink block text-right text-[12px]"
          >
            View buyer traceability →
          </Link>
        </aside>
      </div>
    </section>
  );
}
