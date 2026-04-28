'use client';

// Catalogue list — mirrors /demo/myellium.html `renderCat()` + `sf()` (lines
// 600-635 + 854-885). Filter pills toggle a `format` filter that hides
// non-matching rows. Seeded from local data; Cell 2.4 swaps in Supabase.

import { useState } from 'react';
import { BG, FMT, IMGS, SPECIES } from '@/lib/data/species';
import { useCart } from '@/components/cart/CartProvider';

type FilterKey = 'all' | 'fresh' | 'powder' | 'spawn' | 'culture' | 'instock';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'fresh', label: 'Fresh fruiting body' },
  { key: 'powder', label: 'Dried powder' },
  { key: 'spawn', label: 'Grain spawn' },
  { key: 'culture', label: 'Liquid culture' },
  { key: 'instock', label: 'In stock' },
];

export function CatalogueList() {
  const [filter, setFilter] = useState<FilterKey>('all');
  const { add } = useCart();

  const visible = SPECIES.filter((s) => {
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
          return (
            <div className="sp-row" key={s.id}>
              <div
                className="sp-photo"
                style={{
                  backgroundImage: `url('${IMGS[s.key]}')`,
                  backgroundColor: BG[s.key],
                }}
              >
                <div className="sp-photo-num">{s.num}</div>
              </div>
              <div className="sp-body">
                <div className="sp-name">{s.name}</div>
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
                    onClick={() => add(s.id)}
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
