// Smoke-test that workspace packages resolve from the Next.js app.
// Real catalogue data wires up in Cells 2.4 / 2.5.
import {
  calculateLinePrice,
  freshnessLabel,
  getTierDiscount,
} from '@repo/shared';
import { PageHeader } from '@/components/shell/PageHeader';

const FILTERS = [
  'All',
  'Fresh fruiting body',
  'Dried powder',
  'Grain spawn',
  'Liquid culture',
  'In stock',
];

export default function StorefrontHome() {
  const samplePrice = calculateLinePrice(2500, 50, 'agreement');
  const sampleFreshness = freshnessLabel('2026-03-01', 90);
  const oemDiscount = getTierDiscount('oem');

  return (
    <>
      <PageHeader
        label="2026 Spring harvest"
        title="Species"
        italicSuffix="catalogue"
        description="Inoculation-dated, contamination-checked, cold-chain certified. Monday dispatch for all fresh formats."
        stat={{ value: 6, label: 'Species available' }}
      />

      <div className="flex flex-wrap items-center gap-1.5 border-b-[3px] border-dotted border-[color:var(--dot)] px-11 py-3.5">
        {FILTERS.map((f, i) => (
          <button
            key={f}
            type="button"
            className={`border-[3px] border-dotted px-3.5 py-1 font-sans text-[10px] uppercase tracking-wider3 transition-colors ${
              i === 0
                ? 'border-ink bg-ink text-putty'
                : 'border-[color:var(--dot)] text-ink3 hover:border-ink hover:text-ink'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Phase-2 placeholder: shared-package smoke test. Replaced by real
          catalogue list in Cell 2.4. */}
      <div className="px-11 py-10">
        <p className="mb-4 text-[9px] uppercase tracking-wider5 text-ink3">
          Workspace smoke-test
        </p>
        <dl className="grid grid-cols-1 gap-6 border-[3px] border-dotted border-[color:var(--dot)] p-6 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-ink3">Sample tier discount (oem)</dt>
            <dd className="mt-1 font-mono text-base text-ink">
              {(oemDiscount * 100).toFixed(0)}%
            </dd>
          </div>
          <div>
            <dt className="text-ink3">calculateLinePrice(2500, 50, agreement)</dt>
            <dd className="mt-1 font-mono text-base text-ink">{samplePrice}¢</dd>
          </div>
          <div>
            <dt className="text-ink3">freshnessLabel(2026-03-01, 90d)</dt>
            <dd className="mt-1 font-mono text-base text-ink">{sampleFreshness}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
