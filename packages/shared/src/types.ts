// =============================================================
// @repo/shared — types.ts
//
// Re-exports DB row types from @repo/db and defines domain types
// that live above the raw DB layer (cart, quotes, webhooks).
// =============================================================

export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from '@repo/db';

import type { Tables, Enums } from '@repo/db';

// ── Convenience row aliases ───────────────────────────────────

export type BatchRow        = Tables<'batches'>;
export type CompanyRow      = Tables<'companies'>;
export type CompanyUserRow  = Tables<'company_users'>;
export type OrderRow        = Tables<'orders'>;
export type OrderItemRow    = Tables<'order_items'>;
export type SpeciesRow      = Tables<'species'>;
export type SubscriptionRow = Tables<'subscriptions'>;
export type QuoteRow        = Tables<'quotes'>;

// ── Enum aliases ──────────────────────────────────────────────

export type CompanyTier           = Enums<'company_tier'>;
export type CompanyUserRole       = Enums<'company_user_role'>;
export type ContaminationResult   = Enums<'contamination_result'>;
export type OrderStatus           = Enums<'order_status'>;
export type PaymentMethod         = Enums<'payment_method'>;
export type ProductFormat         = Enums<'product_format'>;
export type QuoteStatus           = Enums<'quote_status'>;
export type SubscriptionFrequency = Enums<'subscription_frequency'>;

// ── Domain types ──────────────────────────────────────────────

/** A single item in the client-side cart (before an order exists). */
export interface CartItem {
  speciesId:  string;
  speciesName: string;
  format:     ProductFormat;
  /** Calculated unit price in pence/cents for the buyer's tier. */
  unitPrice:  number;
  quantity:   number;
}

/** A line item inside a `quotes.line_items` JSON array. */
export interface QuoteLineItem {
  speciesId:  string;
  speciesName: string;
  format:     ProductFormat;
  unitPrice:  number;
  quantity:   number;
  /** Optional sales note visible to the buyer. */
  note?:      string;
}

/** Normalized shipping address used internally after parsing company JSON. */
export interface ShippingAddress {
  name?:    string;
  street1:  string;
  street2?: string;
  city:     string;
  state?:   string;
  zip?:     string;
  country:  string;
  phone?:   string;
  email?:   string;
}
