// Species detail page (Cell 2.5).
//
// Server component, dynamically rendered (uses cookies for tier resolution).
// Renders the full datasheet, per-format tier-priced rows, and the
// freshest passing-batch indicator. The cart `Add` button reuses the
// CartProvider via a tiny client wrapper so this page can stay server-side
// for SEO + initial paint.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/shell/PageHeader';
import { loadSpeciesDetail } from '@/lib/data/species-detail';
import { BG, IMGS, FMT } from '@/lib/data/species';
import { AddToCartButton } from './AddToCartButton';

const TIER_LABEL: Record<'spot' | 'agreement' | 'oem', string> = {
  spot: 'List price',
  agreement: 'Agreement tier (10% off)',
  oem: 'OEM tier (22% off)',
};

const fmtGBP = (n: number) =>
  `£${n.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default async function SpeciesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await loadSpeciesDetail(id);
  if (!detail) notFound();

  const inStock = detail.totalUnits > 0;
  const fb = detail.freshestBatch;

  return (
    <>
      <PageHeader
        label={`Catalogue · ${detail.num}`}
        title={detail.commonName}
        italicSuffix={detail.latinName}
        description={`${detail.substrateType} · shelf life ${detail.shelfLabel} · ${detail.dispatch === 'MON' ? 'Monday-only dispatch' : 'any-day dispatch'}.`}
        stat={{
          value: detail.totalUnits,
          label: inStock ? 'Units available' : 'Out of stock',
        }}
      />

      <div className="grid gap-0 md:grid-cols-[360px_1fr]">
        <div
          className="min-h-[360px] border-b-[3px] border-r-[3px] border-dotted border-[color:var(--dot)] bg-cover bg-center"
          style={{
            backgroundImage: `url('${IMGS[detail.key]}')`,
            backgroundColor: BG[detail.key],
          }}
          aria-hidden
        />
        <div className="border-b-[3px] border-dotted border-[color:var(--dot)] px-11 py-10">
          <div className="mb-3 text-[9px] uppercase tracking-wider5 text-ink3">
            Datasheet
          </div>
          <dl className="grid grid-cols-2 gap-x-10 gap-y-4 text-[12px] text-ink2">
            <div>
              <dt className="text-ink3">Substrate</dt>
              <dd className="mt-1 text-ink">{detail.substrateType}</dd>
            </div>
            <div>
              <dt className="text-ink3">Shelf life</dt>
              <dd className="mt-1 text-ink">{detail.shelfLabel}</dd>
            </div>
            <div>
              <dt className="text-ink3">Cold chain</dt>
              <dd className="mt-1 text-ink">
                {detail.coldChainRequired ? 'Required' : 'Not required'}
              </dd>
            </div>
            <div>
              <dt className="text-ink3">Dispatch window</dt>
              <dd className="mt-1 text-ink">
                {detail.dispatchWindow.join(', ')}
              </dd>
            </div>
          </dl>
          {detail.datasheetUrl ? (
            <p className="mt-6 text-[11px] text-ink3">
              <a
                href={detail.datasheetUrl}
                className="underline decoration-dotted underline-offset-4"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download full datasheet (PDF)
              </a>
            </p>
          ) : null}
        </div>
      </div>

      <section className="border-b-[3px] border-dotted border-[color:var(--dot)] px-11 py-10">
        <div className="mb-5 flex items-baseline justify-between gap-6">
          <div>
            <div className="text-[9px] uppercase tracking-wider5 text-ink3">
              Available formats
            </div>
            <h2 className="mt-2 font-serif text-3xl font-light text-ink">
              Pricing
              <i className="italic"> &amp; pack sizes</i>
            </h2>
          </div>
          <div className="text-right text-[11px] text-ink3">
            {TIER_LABEL[detail.tier]}
          </div>
        </div>

        <ul className="divide-y-[3px] divide-dotted divide-[color:var(--dot)] border-y-[3px] border-dotted border-[color:var(--dot)]">
          {detail.formats.map((f) => {
            const discounted = f.tierPrice < f.listPrice;
            return (
              <li
                key={f.format}
                className="flex items-center justify-between gap-6 py-5"
              >
                <div>
                  <div className="text-[13px] text-ink">{FMT[f.format]}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider3 text-ink3">
                    Per unit
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    {discounted ? (
                      <div className="text-[11px] text-ink3 line-through">
                        {fmtGBP(f.listPrice)}
                      </div>
                    ) : null}
                    <div className="font-serif text-2xl font-light italic text-ink">
                      {fmtGBP(f.tierPrice)}
                    </div>
                  </div>
                  <AddToCartButton
                    item={{
                      speciesId: detail.id,
                      speciesName: detail.commonName,
                      format: f.format,
                      unitPrice: Math.round(f.tierPrice * 100),
                      quantity: 1,
                    }}
                    disabled={!inStock}
                    label={inStock ? '+ Add to cart' : 'Out of stock'}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="px-11 py-10">
        <div className="mb-5 text-[9px] uppercase tracking-wider5 text-ink3">
          Freshest passing batch
        </div>
        {fb ? (
          <div className="grid gap-6 md:grid-cols-4 text-[12px] text-ink2">
            <div>
              <div className="text-ink3">Batch id</div>
              <div className="mt-1 font-mono text-[11px] text-ink">{fb.id}</div>
            </div>
            <div>
              <div className="text-ink3">Inoculated</div>
              <div className="mt-1 text-ink">{fb.inoculationDate}</div>
            </div>
            <div>
              <div className="text-ink3">Harvested</div>
              <div className="mt-1 text-ink">{fb.harvestDate ?? '—'}</div>
            </div>
            <div>
              <div className="text-ink3">Substrate lot</div>
              <div className="mt-1 text-ink">{fb.substrateLot}</div>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-ink3">
            No passing batches in stock. Check back after the next harvest run.
          </p>
        )}
        <p className="mt-8 text-[11px] text-ink3">
          <Link
            href="/"
            className="underline decoration-dotted underline-offset-4"
          >
            ← Back to catalogue
          </Link>
        </p>
      </section>
    </>
  );
}
