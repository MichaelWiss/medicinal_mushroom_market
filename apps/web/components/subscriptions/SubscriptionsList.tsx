'use client';

// Live subscriptions list (Cell 4.2). Each row mutates real DB state via
// server actions in `app/actions/subscriptions.ts`. Demo markup
// (`/demo/myellium.html` ~lines 950-985) preserved end-to-end so the
// page still matches the visual prototype.

import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import {
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
  setSubscriptionQuantity,
} from '@/app/actions/subscriptions';

export type SubLine = {
  id: string;
  name: string;
  meta: string;
  qty: number;
  on: boolean;
};

export function SubscriptionsList({ initial }: { initial: SubLine[] }) {
  const [subs, setSubs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  const aq = (i: number, d: number) => {
    const target = subs[i];
    if (!target) return;
    const next = Math.max(1, target.qty + d);
    if (next === target.qty) return;
    // Optimistic update.
    setSubs((curr) =>
      curr.map((s, idx) => (idx === i ? { ...s, qty: next } : s)),
    );
    startTransition(async () => {
      const result = await setSubscriptionQuantity(target.id, next);
      if (!result.ok) {
        setSubs((curr) =>
          curr.map((s, idx) =>
            idx === i ? { ...s, qty: target.qty } : s,
          ),
        );
        toast(`Failed to update ${target.name}: ${result.error}`);
      }
    });
  };

  const ts = (i: number) => {
    const target = subs[i];
    if (!target) return;
    const nextOn = !target.on;
    setSubs((curr) =>
      curr.map((s, idx) => (idx === i ? { ...s, on: nextOn } : s)),
    );
    startTransition(async () => {
      const result = nextOn
        ? await resumeSubscription(target.id)
        : await pauseSubscription(target.id);
      if (!result.ok) {
        setSubs((curr) =>
          curr.map((s, idx) =>
            idx === i ? { ...s, on: target.on } : s,
          ),
        );
        toast(`Failed: ${result.error}`);
      } else {
        toast(nextOn ? `${target.name} resumed` : `${target.name} paused`);
      }
    });
  };

  const cancel = (i: number) => {
    const target = subs[i];
    if (!target) return;
    if (
      !confirm(
        `Cancel ${target.name} subscription? This stops all future dispatches and Stripe billing.`,
      )
    ) {
      return;
    }
    setSubs((curr) => curr.filter((_, idx) => idx !== i));
    startTransition(async () => {
      const result = await cancelSubscription(target.id);
      if (!result.ok) {
        setSubs((curr) => [...curr, target]);
        toast(`Failed to cancel: ${result.error}`);
      } else {
        toast(`${target.name} cancelled`);
      }
    });
  };

  return (
    <div className="sub-list" aria-busy={pending}>
      {subs.map((s, i) => (
        <div className="sub-row" key={s.id}>
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
                disabled={pending}
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
                disabled={pending}
              >
                +
              </button>
            </div>
            <button
              type="button"
              className={s.on ? 'tog' : 'tog off'}
              aria-label={s.on ? 'Pause line' : 'Resume line'}
              onClick={() => ts(i)}
              disabled={pending}
            >
              <span className="tog-k" />
            </button>
            <button
              type="button"
              onClick={() => cancel(i)}
              disabled={pending}
              style={{
                marginLeft: 12,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: '#7a3030',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
