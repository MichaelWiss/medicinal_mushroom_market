// Admin batch list (Cell 6.4). Service-role read; status filter via
// search param so production team can drill into pending QA queue.

import Link from 'next/link';
import type { Route } from 'next';
import {
  loadAdminBatches,
  type ContaminationResult,
} from '@/lib/data/admin-batches';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<ContaminationResult, string> = {
  pending: 'Pending QA',
  pass: 'Passed',
  fail: 'Failed',
};

const FILTERS: Array<{ value: ContaminationResult | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending QA' },
  { value: 'pass', label: 'Passed' },
  { value: 'fail', label: 'Failed' },
];

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default async function AdminBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter =
    status && status !== 'all' && status in STATUS_LABEL
      ? (status as ContaminationResult)
      : undefined;
  const rows = await loadAdminBatches(
    filter ? { contaminationCheck: filter } : undefined,
  );

  return (
    <section className="px-11 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-[28px] font-light italic text-ink">
          Batches
        </h1>
        <div className="text-[10px] uppercase tracking-wider5 text-ink3">
          {rows.length} batch{rows.length === 1 ? '' : 'es'}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active =
            (filter === undefined && f.value === 'all') || filter === f.value;
          const href = (
            f.value === 'all'
              ? '/console/batches'
              : `/console/batches?status=${f.value}`
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
              <th className="px-4 py-3">Species</th>
              <th className="px-4 py-3">Inoculated</th>
              <th className="px-4 py-3">Substrate lot</th>
              <th className="px-4 py-3">QA</th>
              <th className="px-4 py-3 text-right">Available</th>
              <th className="px-4 py-3">CoA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr
                key={b.id}
                className="border-t-[3px] border-dotted border-[color:var(--dot)]"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/console/batches/${b.id}` as Route}
                    className="tlink mono"
                  >
                    {b.shortRef}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="text-ink">{b.speciesCommonName}</div>
                  <div className="text-[11px] italic text-ink2">
                    {b.speciesLatinName}
                  </div>
                </td>
                <td className="px-4 py-3">{fmtDate(b.inoculationDate)}</td>
                <td className="px-4 py-3 mono text-[11px]">{b.substrateLot}</td>
                <td className="px-4 py-3">
                  {STATUS_LABEL[b.contaminationCheck]}
                </td>
                <td className="px-4 py-3 text-right mono">{b.availableUnits}</td>
                <td className="px-4 py-3 text-[11px] uppercase tracking-wider3">
                  {b.coaUrl ? (
                    <span className="text-ink">Uploaded</span>
                  ) : (
                    <span className="text-ink3">Pending</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink3">
                  No batches match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
