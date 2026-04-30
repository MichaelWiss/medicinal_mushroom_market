'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { approveQuote } from '@/app/actions/quotes';
import { useToast } from '@/components/ui/ToastProvider';

export function ApproveQuoteButton({
  quoteId,
  disabled,
}: {
  quoteId: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="bg-yellow px-6 py-3 text-[10px] font-medium uppercase tracking-wider5 text-navy hover:bg-yellow2 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await approveQuote(quoteId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            toast('Quote approved — order created');
            router.push(`/orders/${res.orderId}` as Route);
          });
        }}
      >
        {pending ? 'Approving…' : 'Approve & convert to order'}
      </button>
      {error ? (
        <div
          role="alert"
          className="mt-3 border-[3px] border-dotted border-red-700 px-3 py-2 text-[12px] text-red-800"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
