// Canonical human-readable labels for the public-schema enums.
//
// Replaces the per-page `STATUS_LABEL` / `PAYMENT_LABEL` / similar maps
// that used to be re-declared in every list and detail page. The
// `FMT` map for product formats lives separately in
// `lib/data/species.ts` for historical reasons; keep using that for
// now.

import type {
  OrderStatus,
  PaymentMethod,
  QuoteStatus,
  ContaminationResult,
  SubscriptionFrequency,
} from '@repo/shared';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  picking: 'Picking',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  card: 'Card',
  net30: 'Net-30 invoice',
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  approved: 'Approved',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export const CONTAMINATION_LABEL: Record<ContaminationResult, string> = {
  pending: 'Pending QA',
  pass: 'Passed',
  fail: 'Failed',
};

export const FREQUENCY_LABEL: Record<SubscriptionFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};
