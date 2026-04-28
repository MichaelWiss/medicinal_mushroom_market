import { PageHeader } from '@/components/shell/PageHeader';

// Mirrors /demo/myellium.html (lines 705-722). Real bulk-quote workflow ships
// in a later phase.
const STEPS = [
  {
    n: '01',
    title: 'Add items to your cart',
    desc: 'Browse the catalogue and select the species, formats, and quantities you need. Minimum 50 units per line for bulk pricing to apply.',
  },
  {
    n: '02',
    title: 'Convert cart to a quote',
    desc: 'At checkout, select Request quote instead of placing an order. Specify your required dispatch window and delivery address.',
  },
  {
    n: '03',
    title: 'Receive pricing within 48 hours',
    desc: 'Our supply team will confirm availability, apply volume tiers, and return a signed PDF quote. OEM accounts receive a full CoA bundle with every shipment.',
  },
];

export default function QuotesPage() {
  return (
    <>
      <PageHeader
        label="Bulk & OEM pricing"
        title="Bulk"
        italicSuffix="quotes"
        description="Volume pricing from 50 units per line. OEM and pharma extract lab pricing on application. Valid 14 days."
      />

      <div className="quotes-wrap">
        {STEPS.map((s) => (
          <div className="q-step" key={s.n}>
            <div className="q-num">{s.n}</div>
            <div>
              <div className="q-title">{s.title}</div>
              <div className="q-desc">{s.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ paddingTop: 28 }}>
          <a
            href="/"
            className="inline-block bg-yellow px-5 py-2.5 font-sans text-[10px] uppercase tracking-wider3 text-navy transition-colors hover:bg-yellow2"
          >
            Browse catalogue →
          </a>
        </div>
      </div>
    </>
  );
}
