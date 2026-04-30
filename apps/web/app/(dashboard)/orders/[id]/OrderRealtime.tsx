'use client';

// Live status pill for an order detail page (Cell 3.5).
//
// Subscribes to `postgres_changes` on `public.orders` filtered by `id=eq.X`
// and updates the displayed status + tracking number when the row changes.
// The realtime broadcast is RLS-scoped to the caller's company by the
// existing per-company policy on `orders`, so a user from another company
// cannot receive payloads for an order they cannot read.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'picking'
  | 'dispatched'
  | 'delivered'
  | 'cancelled';

const STATUS_PILL: Record<OrderStatus, string> = {
  pending: 's-con',
  confirmed: 's-con',
  picking: 's-con',
  dispatched: 's-dis',
  delivered: 's-dis',
  cancelled: 's-con',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  picking: 'Picking',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

type Props = {
  orderId: string;
  initialStatus: OrderStatus;
  initialTrackingNumber: string | null;
};

export function OrderRealtime({
  orderId,
  initialStatus,
  initialTrackingNumber,
}: Props) {
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(
    initialTrackingNumber,
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const row = payload.new as {
            status?: OrderStatus;
            tracking_number?: string | null;
          };
          if (row.status) setStatus(row.status);
          if ('tracking_number' in row) {
            setTrackingNumber(row.tracking_number ?? null);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  return (
    <div className="flex items-center gap-3">
      <span className={`s-pill ${STATUS_PILL[status]}`}>
        {STATUS_LABEL[status]}
      </span>
      {trackingNumber ? (
        <span className="text-[12px] uppercase tracking-[0.18em] text-ink2">
          Tracking · <span className="mono text-ink">{trackingNumber}</span>
        </span>
      ) : null}
    </div>
  );
}
