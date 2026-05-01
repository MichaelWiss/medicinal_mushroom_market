// Admin batch detail (Cell 6.4). Service-role read so ops can edit any
// batch. The mutating Server Actions live in
// `apps/web/app/actions/batches.ts` and re-verify the session.

import Link from 'next/link';
import type { Route } from 'next';
import { notFound } from 'next/navigation';
import {
  loadAdminBatch,
  signAdminCoaUrl,
} from '@/lib/data/admin-batches';
import { BatchEditForms } from './BatchEditForms';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  pending: 'Pending QA',
  pass: 'Passed',
  fail: 'Failed',
} as const;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

export default async function AdminBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const batch = await loadAdminBatch(id);
  if (!batch) notFound();

  const previewUrl = batch.coaUrl ? await signAdminCoaUrl(batch.id) : null;

  return (
    <section className="px-11 py-10">
      <div className="text-[10px] uppercase tracking-wider5 text-ink3">
        <Link href={'/console/batches' as Route} className="tlink">
          ← Batches
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-serif text-[28px] font-light italic text-ink">
          {batch.shortRef}
        </h1>
        <div className="text-[12px] uppercase tracking-wider3 text-ink2">
          QA · <span className="text-ink">{STATUS_LABEL[batch.contaminationCheck]}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="border-[3px] border-dotted border-[color:var(--dot)] p-5">
            <div className="text-[10px] uppercase tracking-wider5 text-ink3">
              Species
            </div>
            <div className="mt-2 text-[14px] text-ink">
              {batch.speciesCommonName}
            </div>
            <div className="text-[12px] italic text-ink2">
              {batch.speciesLatinName}
            </div>
          </div>

          <div className="border-[3px] border-dotted border-[color:var(--dot)] p-5">
            <div className="text-[10px] uppercase tracking-wider5 text-ink3">
              Production
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <dt className="text-ink3">Inoculated</dt>
                <dd className="text-ink">{fmtDate(batch.inoculationDate)}</dd>
              </div>
              <div>
                <dt className="text-ink3">Harvested</dt>
                <dd className="text-ink">{fmtDate(batch.harvestDate)}</dd>
              </div>
              <div>
                <dt className="text-ink3">Substrate lot</dt>
                <dd className="text-ink mono text-[11px]">
                  {batch.substrateLot}
                </dd>
              </div>
              <div>
                <dt className="text-ink3">Yield</dt>
                <dd className="text-ink">
                  {batch.yieldKg !== null ? `${batch.yieldKg.toFixed(2)} kg` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-ink3">Storage zone</dt>
                <dd className="text-ink">{batch.storageZone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-ink3">Created</dt>
                <dd className="text-ink">{fmtDate(batch.createdAt)}</dd>
              </div>
            </dl>
          </div>

          <BatchEditForms
            batchId={batch.id}
            contaminationCheck={batch.contaminationCheck}
            availableUnits={batch.availableUnits}
            hasCoa={Boolean(batch.coaUrl)}
          />
        </div>

        <aside className="space-y-6">
          <div className="border-[3px] border-dotted border-[color:var(--dot)] p-5">
            <div className="text-[10px] uppercase tracking-wider5 text-ink3">
              Certificate of Analysis
            </div>
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block tlink mono text-[11px]"
              >
                Download preview →
              </a>
            ) : (
              <div className="mt-3 text-[12px] text-ink2">
                No CoA on file. Upload below.
              </div>
            )}
            <div className="mt-2 text-[10px] uppercase tracking-wider3 text-ink3">
              Buyers download via signed URL ({'{batch_id}.pdf'}).
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
