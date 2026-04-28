'use client';

// Mirrors /demo/myellium.html `aq(i,d)` (qty +/-) and `ts(i)` (toggle on/off)
// from the JS block (~ lines 950-985). Pure local state for now; real backend
// wires in Cell 2.6.

import { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';

export type SubLine = {
  name: string;
  meta: string;
  qty: number;
  on: boolean;
};

export function SubscriptionsList({ initial }: { initial: SubLine[] }) {
  const [subs, setSubs] = useState(initial);
  const toast = useToast();

  const aq = (i: number, d: number) => {
    setSubs((curr) =>
      curr.map((s, idx) =>
        idx === i ? { ...s, qty: Math.max(0, s.qty + d) } : s
      )
    );
  };
  const ts = (i: number) => {
    setSubs((curr) =>
      curr.map((s, idx) => {
        if (idx !== i) return s;
        const next = { ...s, on: !s.on };
        toast(next.on ? `${s.name} resumed` : `${s.name} paused`);
        return next;
      })
    );
  };

  return (
    <div className="sub-list">
      {subs.map((s, i) => (
        <div className="sub-row" key={s.name}>
          <div className="sub-n">{String(i + 1).padStart(2, '0')}</div>
          <div className="sub-b">
            <div className="sub-nm">{s.name}</div>
            <div className="sub-mt">{s.meta}</div>
          </div>
          <div className="sub-c">
            <div className="qc">
              <button
                type="button"
                className="qb"
                aria-label="Decrease"
                onClick={() => aq(i, -1)}
              >
                −
              </button>
              <input
                className="qv"
                value={s.qty}
                readOnly
                aria-label="Quantity"
              />
              <button
                type="button"
                className="qb"
                aria-label="Increase"
                onClick={() => aq(i, 1)}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className={s.on ? 'tog' : 'tog off'}
              aria-label={s.on ? 'Pause line' : 'Resume line'}
              onClick={() => ts(i)}
            >
              <span className="tog-k" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
