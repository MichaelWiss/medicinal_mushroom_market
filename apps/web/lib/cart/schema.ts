// Pure cart validation utilities — safe to import from both server and
// client modules. Kept separate from `store.ts` (which is `'use client'`
// because it owns the Zustand store) so server actions like
// `lib/cart/sync.ts` can validate payloads without dragging the React
// store into the server bundle.

import { z } from 'zod';
import { cartItemSchema, type CartItemInput } from '@repo/shared';

export type CartLine = CartItemInput;

export const cartArraySchema = z.array(cartItemSchema);

/**
 * Validates an arbitrary unknown payload against the cart schema and
 * returns the parsed array, or `[]` if invalid.
 */
export function parseCart(raw: unknown): CartLine[] {
  if (!raw) return [];
  const parsed = cartArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}
