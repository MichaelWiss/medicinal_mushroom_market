import { PageHeader } from '@/components/shell/PageHeader';

// Mirrors /demo/myellium.html `renderTrace()` (lines 950-975). Real batch
// records arrive from Supabase in Cell 2.5.
const BATCHES = [
  {
    name: "Lion's Mane",
    batch: 'BCH-2026-044',
    inoc: '22 Mar 2026',
    harvest: '13 Apr 2026',
    substrate: 'Hardwood sawdust S-0882',
    zone: 'Cold-02',
    yield: '3.2 kg',
    shelf: '4 days',
  },
  {
    name: 'Reishi',
    batch: 'BCH-2026-039',
    inoc: '10 Feb 2026',
    harvest: '29 Mar 2026',
    substrate: 'Oak log lot S-0741',
    zone: 'Dry-07',
    yield: '1.8 kg',
    shelf: '11 months',
  },
];

export default function TraceabilityPage() {
  return (
    <>
      <PageHeader
        label="Order MYC-2026-024"
        title="Batch"
        italicSuffix="traceability"
        description="Full inoculation, harvest, and contamination records. Certificates of Analysis on file."
        stat={{ value: BATCHES.length, label: 'Batch records' }}
      />

      <div className="trace-wrap">
        {BATCHES.map((b) => (
          <div className="trace-card" key={b.batch}>
            <div className="trace-hd">
              <div className="trace-thumb" />
              <div>
                <div className="trace-species">{b.name}</div>
                <div className="trace-batchid">{b.batch}</div>
              </div>
              <span className="s-pill s-dis">Pass</span>
            </div>
            <div className="trace-grid">
              <div className="tc">
                <label>Inoculation date</label>
                <span>{b.inoc}</span>
              </div>
              <div className="tc">
                <label>Harvest date</label>
                <span>{b.harvest}</span>
              </div>
              <div className="tc">
                <label>Substrate lot</label>
                <span>{b.substrate}</span>
              </div>
              <div className="tc">
                <label>Contamination check</label>
                <span className="tc-pass">Pass</span>
              </div>
              <div className="tc">
                <label>Storage zone</label>
                <span>{b.zone}</span>
              </div>
              <div className="tc">
                <label>Batch yield</label>
                <span>{b.yield}</span>
              </div>
              <div className="tc">
                <label>Shelf life remaining</label>
                <span>{b.shelf}</span>
              </div>
              <div className="tc">
                <label>Certificate of Analysis</label>
                <span className="tc-coa">Download CoA →</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
