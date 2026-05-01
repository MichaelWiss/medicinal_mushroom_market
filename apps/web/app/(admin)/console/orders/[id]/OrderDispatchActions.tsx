'use client';

// Admin dispatch action panel (Cell 6.2). Drives the
// confirmed → picking → dispatched walk via Server Actions.

import { useTransition, useState } from 'react';
import {
  generateLabelForOrder,
  markOrderPicking,
  type DispatchActionResult,
} from '@/app/actions/dispatch';
import type { OrderStatus } from '@/lib/data/orders';

export function OrderDispatchActions({
  orderId,
  status,
  hasShippingAddress,
}: {
  orderId: string;
  status: OrderStatus;
  hasShippingAddress: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    kind: 'ok' | 'err';
    message: string;
    labelUrl?: string;
  } | null>(null);

  const onPick = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await markOrderPicking(orderId);
      handleResult(res, 'Marked as picking.');
    });
  };

  const onLabel = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await generateLabelForOrder({ orderId });
      handleResult(
        res,
        'Label generated and order dispatched.',
        res.ok ? res.labelUrl : undefined,
      );
    });
  };

  const handleResult = (
    res: DispatchActionResult,
    okMessage: string,
    labelUrl?: string,
  ) => {
    if (res.ok) {
      const next: { kind: 'ok'; message: string; labelUrl?: string } = {
        kind: 'ok',
        message: okMessage,
      };
      if (labelUrl) next.labelUrl = labelUrl;
      setFeedback(next);
    } else {
      setFeedback({ kind: 'err', message: res.error });
    }
  };

  return (
    <div className="border-[3px] border-dotted border-[color:var(--dot)] p-5">
      <div className="text-[10px] uppercase tracking-wider5 text-ink3">
        Dispatch actions
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onPick}
          disabled={pending || status !== 'confirmed'}
          className="bg-navy px-4 py-2 font-sans text-[10px] uppercase tracking-wider3 text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark picking
        </button>
        <button
          type="button"
          onClick={onLabel}
          disabled={pending || status !== 'picking' || !hasShippingAddress}
          className="bg-yellow px-4 py-2 font-sans text-[10px] uppercase tracking-wider3 text-navy transition-opacity hover:bg-yellow2 disabled:cursor-not-allowed disabled:opacity-40"
          title={
            !hasShippingAddress
              ? 'Customer is missing a shipping address.'
              : status !== 'picking'
                ? 'Order must be in picking before generating a label.'
                : undefined
          }
        >
          Generate label →
        </button>
        {pending ? (
          <span className="text-[11px] uppercase tracking-wider3 text-ink3">
            Working…
          </span>
        ) : null}
      </div>

      {!hasShippingAddress ? (
        <p className="mt-3 text-[12px] text-amber-700">
          Customer shipping address is incomplete; label generation is blocked
          until ops captures street, city, and country.
        </p>
      ) : null}

      {feedback ? (
        <div
          className={`mt-4 border-[3px] border-dotted p-3 text-[12px] ${
            feedback.kind === 'ok'
              ? 'border-emerald-300 text-emerald-900'
              : 'border-rose-300 text-rose-900'
          }`}
        >
          <div>{feedback.message}</div>
          {feedback.labelUrl ? (
            <a
              href={feedback.labelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tlink mt-2 inline-block"
            >
              Download label PDF →
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
