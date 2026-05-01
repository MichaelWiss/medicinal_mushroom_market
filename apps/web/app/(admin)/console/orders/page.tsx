// Admin order list (Cell 6.2). Service-role read; status filter via
// search param so ops can quickly drill into "needs picking" /
// "ready to ship" / "in transit" buckets.

import Link from 'next/link';
import type { Route } from 'next';
import { loadAdminOrders } from '@/lib/data/admin-orders';
import type { OrderStatus } from '@/lib/data/orders';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  picking: 'Picking',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const FILTERS: Array<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'picking', label: 'Picking' },
  { value: 'dispatched', label: 'In transit' },
  { value: 'delivered', label: 'Delivered' },
];

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

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter =
    status && status !== 'all' && status in STATUS_LABEL
      ? (status as OrderStatus)
      : undefined;
  const rows = await loadAdminOrders(filter ? { status: filter } : undefined);

  return (
    <section className="px-11 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-[28px] font-light italic text-ink">
          Orders
        </h1>
        <div className="text-[10px] uppercase tracking-wider5 text-ink3">
          {rows.length} order{rows.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active =
            (filter === undefined && f.value === 'all') || filter === f.value;
          const href = (
            f.value === 'all' ? '/console/orders' : `/console/orders?status=${f.value}`
          ) as Route;
          return (
            <Link
              key={f.value}
              href={href}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-wider3 ${
                active
                  ? 'bg-navy text-white'
                  : 'border-[3px] border-dotted border-[color:var(--dot)] text-ink2 hover:text-ink'
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-6 overflow-x-auto border-[3px] border-dotted border-[color:var(--dot)]">
        <table className="w-full text-[12px]">
          <thead className="text-left text-[10px] uppercase tracking-wider5 text-ink3">
            <tr>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Dispatch</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Tracking</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr
                key={o.id}
                className="border-t-[3px] border-dotted border-[color:var(--dot)]"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/console/orders/${o.id}` as Route}
                    className="tlink mono"
                  >
                    {o.shortRef}
                  </Link>
                </td>
                <td className="px-4 py-3">{o.companyName}</td>
                <td className="px-4 py-3">{o.itemsLabel}</td>
                <td className="px-4 py-3">{STATUS_LABEL[o.status]}</td>
                <td className="px-4 py-3">{fmtDate(o.dispatchDate)}</td>
                <td className="px-4 py-3">{fmtGBP(o.totalPrice)}</td>
                <td className="px-4 py-3">
                  {o.trackingNumber ? (
                    <span className="mono text-[11px]">{o.trackingNumber}</span>
                  ) : (
                    <span className="text-ink3">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink3">
                  No orders match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
