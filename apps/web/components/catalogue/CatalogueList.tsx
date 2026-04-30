'use client';

// Catalogue list — mirrors /demo/myellium.html `renderCat()` + `sf()` (lines
// 600-635 + 854-885). Filter pills toggle a `format` filter that hides
// non-matching rows. Initial data is fetched server-side (ISR, see
// app/(storefront)/page.tsx). Live `available_units` updates stream in via
// Supabase Realtime on the `batches` table — Cell 2.4.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { BG, IMGS } from '@/lib/data/species';
import { FMT } from '@/lib/data/species';
import type { CatalogueSpecies } from '@/lib/data/catalogue';
import { useCartStore } from '@/lib/cart/store';
import { createClient } from '@/lib/supabase/browser';

type FilterKey = 'all' | 'fresh' | 'powder' | 'spawn' | 'culture' | 'instock';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fresh', label: 'Fresh fruiting body' },
  { key: 'powder', label: 'Dried powder' },
  { key: 'spawn', label: 'Grain spawn' },
  { key: 'culture', label: 'Liquid culture' },
  { key: 'instock', label: 'In stock' },
];

type BatchRow = {
  species_id: string;
  available_units: number | null;
  contamination_check: 'pending' | 'pass' | 'fail';
};

export function CatalogueList({
  initialSpecies,
}: {
  initialSpecies: CatalogueSpecies[];
}) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [species, setSpecies] = useState<CatalogueSpecies[]>(initialSpecies);
  const add = useCartStore((s) => s.add);
  const setOpen = useCartStore((s) => s.setOpen);

  // Subscribe to batch changes and recompute per-species unit counts.
  // We re-fetch the passing-batch slice on any change rather than tracking
  // deltas — the row count is small (≤ a few hundred) and the simpler model
  // avoids edge cases around contamination_check transitions.
  useEffect(() => {
    const supabase = createClient();
    const speciesIds = new Set(initialSpecies.map((s) => s.id));

    async function refresh() {
      const { data, error } = await supabase
        .from('batches')
        .select('species_id, available_units')
        .eq('contamination_check', 'pass');
      if (error || !data) return;
      const totals = new Map<string, number>();
      for (const b of data) {
        totals.set(
          b.species_id,
          (totals.get(b.species_id) ?? 0) + (b.available_units ?? 0),
        );
      }
      setSpecies((prev) =>
        prev.map((s) => ({ ...s, units: totals.get(s.id) ?? 0 })),
      );
    }

    const channel = supabase
      .channel('catalogue-batches')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches' },
        (payload) => {
          const row = (payload.new ?? payload.old) as BatchRow | undefined;
          // Ignore broadcasts for species not on the page (anonymous reads
          // are scoped to passing batches but the channel is unscoped).
          if (row && speciesIds.has(row.species_id)) refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialSpecies]);

  const visible = species.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'instock') return s.units > 0;
    return (s.formats as string[]).includes(filter);
  });

  return (
    <>
      <div className="fbar">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={filter === f.key ? 'fp on' : 'fp'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="cat-list">
        {visible.map((s) => {
          const ok = s.units > 0;
          const low = ok && s.units < 20;
          const stockClass = !ok
            ? 'sp-stock-nil'
            : low
              ? 'sp-stock-low'
              : 'sp-stock-ok';
          const stockLabel = !ok
            ? 'Out of stock'
            : low
              ? `Low stock — ${s.units} units`
              : `${s.units} units`;
          const href = `/species/${s.id}` as Route;
          return (
            <div className="sp-row" key={s.id}>
              <Link
                href={href}
                className="sp-photo block"
                style={{
                  backgroundImage: `url('${IMGS[s.key]}')`,
                  backgroundColor: BG[s.key],
                }}
                aria-label={`View ${s.name} datasheet`}
              >
                <div className="sp-photo-num">{s.num}</div>
              </Link>
              <div className="sp-body">
                <Link href={href} className="sp-name hover:underline">
                  {s.name}
                </Link>
                <div className="sp-latin">{s.latin}</div>
                <div className="sp-tags">
                  {s.cold ? (
                    <span className="sp-tag sp-tag-navy">Cold chain</span>
                  ) : null}
                  <span
                    className={
                      s.dispatch === 'MON' ? 'sp-tag sp-tag-yellow' : 'sp-tag'
                    }
                  >
                    {s.dispatch === 'MON' ? 'Mon dispatch' : 'Any day'}
                  </span>
                  {s.formats.slice(0, 2).map((f) => (
                    <span className="sp-tag" key={f}>
                      {FMT[f].split(' ')[0]}
                    </span>
                  ))}
                </div>
                <div className="sp-floor">
                  <div>
                    <div className="sp-price">
                      £{s.price.toFixed(2)}
                      <span className="sp-price-unit">/ unit</span>
                    </div>
                    <div className={`sp-stock ${stockClass}`}>
                      {stockLabel} — shelf life {s.shelf}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sp-add"
                    disabled={!ok}
                    onClick={() => {
                      const firstFormat = s.formats[0];
                      if (!firstFormat) return;
                      add({
                        speciesId: s.id,
                        speciesName: s.name,
                        format: firstFormat,
                        unitPrice: Math.round(s.price * 100),
                        quantity: 1,
                      });
                      setOpen(true);
                    }}
                  >
                    {ok ? '+ Add to cart' : 'Out of stock'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
