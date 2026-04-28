// =============================================================
// @repo/shared — schemas.ts
//
// Zod schemas for runtime validation at system boundaries:
//   - Cart items (client → Server Action)
//   - Quote line items (admin form → DB)
//   - Stripe webhook payloads (webhook handler)
//   - Shippo webhook payloads (webhook handler)
//
// Only the fields actively consumed by handlers are typed here.
// Unknown extra fields are stripped (z.object default behaviour).
// =============================================================

import { z } from 'zod';

// ── Enums ─────────────────────────────────────────────────────

const productFormatSchema = z.enum([
  'fresh', 'powder', 'spawn', 'culture', 'block',
]);

// ── Cart ──────────────────────────────────────────────────────

export const cartItemSchema = z.object({
  speciesId:   z.string().uuid(),
  speciesName: z.string().min(1),
  format:      productFormatSchema,
  unitPrice:   z.number().int().nonnegative(),
  quantity:    z.number().int().positive(),
});

export const cartSchema = z.array(cartItemSchema).min(1);

export type CartItemInput    = z.infer<typeof cartItemSchema>;
export type CartInput        = z.infer<typeof cartSchema>;

// ── Quote line items ──────────────────────────────────────────

export const quoteLineItemSchema = z.object({
  speciesId:   z.string().uuid(),
  speciesName: z.string().min(1),
  format:      productFormatSchema,
  unitPrice:   z.number().int().nonnegative(),
  quantity:    z.number().int().positive(),
  note:        z.string().max(500).optional(),
});

export const quoteLineItemsSchema = z.array(quoteLineItemSchema).min(1);

export type QuoteLineItemInput  = z.infer<typeof quoteLineItemSchema>;
export type QuoteLineItemsInput = z.infer<typeof quoteLineItemsSchema>;

// ── Stripe webhook ────────────────────────────────────────────
// We only consume `checkout.session.completed`.
// The full Stripe event envelope wraps the session in `data.object`.

const stripeCheckoutSessionSchema = z.object({
  id:              z.string(),            // cs_...
  payment_status:  z.string(),            // 'paid' | 'unpaid' | 'no_payment_required'
  metadata:        z.record(z.string(), z.string()).nullable().optional(),
  amount_total:    z.number().int().nullable().optional(),
  customer:        z.string().nullable().optional(),
});

export const stripeWebhookSchema = z.object({
  id:      z.string(),
  type:    z.string(),
  data: z.object({
    object: stripeCheckoutSessionSchema,
  }),
});

export type StripeWebhookPayload = z.infer<typeof stripeWebhookSchema>;
export type StripeCheckoutSession = z.infer<typeof stripeCheckoutSessionSchema>;

// ── Shippo webhook ────────────────────────────────────────────
// We consume `track_updated` events to set orders.status = 'delivered'.

const shippoTrackingStatusSchema = z.object({
  status:       z.string(),   // 'DELIVERED' | 'TRANSIT' | 'FAILURE' | etc.
  status_date:  z.string().optional(),
  location:     z.object({
    city:    z.string().optional(),
    state:   z.string().optional(),
    country: z.string().optional(),
  }).optional(),
});

export const shippoWebhookSchema = z.object({
  event:  z.string(),          // 'track_updated'
  data: z.object({
    tracking_number:  z.string(),
    tracking_status:  shippoTrackingStatusSchema,
    metadata:         z.string().nullable().optional(), // we store order_id here
  }),
});

export type ShippoWebhookPayload  = z.infer<typeof shippoWebhookSchema>;
export type ShippoTrackingStatus  = z.infer<typeof shippoTrackingStatusSchema>;
