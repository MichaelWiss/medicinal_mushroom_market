// Batch traceability detail (Cell 2.6).
//
// Mirrors `/demo/myellium.html` `renderTrace()` (lines ~950-975) but binds
// to live data via `loadTraceability`. RLS guarantees that requesting a
// foreign company's order returns null → notFound().

import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shell/PageHeader';
import { loadTraceability } from '@/lib/data/traceability';

export const dynamic = 'force-dynamic';

const CONTAM_PILL: Record<'pending' | 'pass' | 'fail', string> = {
  pending: 's-con',
  pass: 's-dis',
  fail: 's-con',
};

const CONTAM_LABEL: Record<'pending' | 'pass' | 'fail', string> = {
  pending: 'Pending',
  pass: 'Pass',
  fail: 'Fail',
};

function shelfText(daysRemaining: number, freshness: string): string {
  if (freshness === 'expired') return 'Expired';
  if (daysRemaining >= 60) {
    const months = Math.round(daysRemaining / 30);
    return months >= 12
      ? `${Math.round(months / 12)} year${months >= 24 ? 's' : ''}`
      : `${months} months`;
  }
  return `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
}

export default async function TraceabilityDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const trace = await loadTraceability(orderId);
  if (!trace) notFound();

  return (
    <>
      <PageHeader
        label={`Order ${trace.shortRef}`}
        title="Batch"
        italicSuffix="traceability"
        description="Full inoculation, harvest, and contamination records. Certificates of Analysis on file."
        stat={{ value: trace.items.length, label: 'Batch records' }}
      />

      <div className="trace-wrap">
        {trace.items.length === 0 ? (
          <p className="text-[13px] leading-[1.6] text-ink2">
            This order has no allocated batches yet.
          </p>
        ) : (
          trace.items.map((it) => {
            const b = it.batch;
            return (
              <div className="trace-card" key={it.itemId}>
                <div className="trace-hd">
                  <div className="trace-thumb" />
                  <div>
                    <div className="trace-species">{it.speciesCommonName}</div>
                    <div className="trace-batchid">
                      {b?.shortRef ?? 'AWAITING ALLOCATION'}
                    </div>
                  </div>
                  <span
                    className={`s-pill ${b ? CONTAM_PILL[b.contaminationCheck] : 's-con'}`}
                  >
                    {b ? CONTAM_LABEL[b.contaminationCheck] : 'Pending'}
                  </span>
                </div>

                {b ? (
                  <div className="trace-grid">
                    <div className="tc">
                      <label>Inoculation date</label>
                      <span>{b.inoculationDate}</span>
                    </div>
                    <div className="tc">
                      <label>Harvest date</label>
                      <span>{b.harvestDate ?? '—'}</span>
                    </div>
                    <div className="tc">
                      <label>Substrate lot</label>
                      <span>{b.substrateLot}</span>
                    </div>
                    <div className="tc">
                      <label>Contamination check</label>
                      <span
                        className={
                          b.contaminationCheck === 'pass' ? 'tc-pass' : ''
                        }
                      >
                        {CONTAM_LABEL[b.contaminationCheck]}
                      </span>
                    </div>
                    <div className="tc">
                      <label>Storage zone</label>
                      <span>{b.storageZone ?? '—'}</span>
                    </div>
                    <div className="tc">
                      <label>Batch yield</label>
                      <span>
                        {b.yieldKg !== null ? `${b.yieldKg.toFixed(2)} kg` : '—'}
                      </span>
                    </div>
                    <div className="tc">
                      <label>Shelf life remaining</label>
                      <span>{shelfText(b.daysRemaining, b.freshness)}</span>
                    </div>
                    <div className="tc">
                      <label>Certificate of Analysis</label>
                      {b.coaUrl ? (
                        <a
                          className="tc-coa"
                          href={b.coaUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download CoA →
                        </a>
                      ) : (
                        <span className="tc-coa" style={{ cursor: 'default' }}>
                          CoA pending
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="trace-grid">
                    <div className="tc">
                      <label>Status</label>
                      <span>Allocation pending</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
