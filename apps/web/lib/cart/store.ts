// Cart Zustand store (Cell 3.1).
//
// Items keyed by composite `${speciesId}:${format}` so the same species
// in different formats remain distinct lines. Prices are stored in
// integer pence/cents to match the @repo/shared pricing engine.
//
// `persist` middleware mirrors the store to localStorage so anonymous
// shoppers retain their cart across reloads. Cross-device sync (via the
// `public.carts` table) is layered on top by `CartProvider` once the
// user authenticates — see `lib/cart/sync.ts`.

'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { z } from 'zod';
import {
  cartItemSchema,
  calculateOrderTotal,
  type CartItemInput,
  type CompanyTier,
} from '@repo/shared';

const cartArraySchema = z.array(cartItemSchema);

const STORAGE_KEY = 'mycelium.cart.v1';

export type CartLine = CartItemInput;

export type CartState = {
  /** Items in display order (insertion order). */
  items: CartLine[];
  /** True after the persist middleware has hydrated from localStorage. */
  hydrated: boolean;
  /** Drawer open/close. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Add or merge an item (by speciesId+format). */
  add: (item: CartLine) => void;
  /** Set an exact quantity (0 removes). */
  setQty: (speciesId: string, format: CartLine['format'], qty: number) => void;
  /** Remove a line entirely. */
  remove: (speciesId: string, format: CartLine['format']) => void;
  /** Replace the entire cart (used by server-side sync on sign-in). */
  replace: (items: CartLine[]) => void;
  /** Empty the cart (used on sign-out and after successful checkout). */
  clear: () => void;
};

const keyOf = (speciesId: string, format: CartLine['format']) =>
  `${speciesId}:${format}`;

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hydrated: false,
      open: false,
      setOpen: (open) => set({ open }),
      add: (item) =>
        set((state) => {
          const k = keyOf(item.speciesId, item.format);
          const i = state.items.findIndex(
            (it) => keyOf(it.speciesId, it.format) === k,
          );
          if (i === -1) return { items: [...state.items, item] };
          const next = state.items.slice();
          const existing = next[i]!;
          next[i] = { ...existing, quantity: existing.quantity + item.quantity };
          return { items: next };
        }),
      setQty: (speciesId, format, qty) =>
        set((state) => {
          const k = keyOf(speciesId, format);
          if (qty <= 0) {
            return {
              items: state.items.filter(
                (it) => keyOf(it.speciesId, it.format) !== k,
              ),
            };
          }
          return {
            items: state.items.map((it) =>
              keyOf(it.speciesId, it.format) === k
                ? { ...it, quantity: qty }
                : it,
            ),
          };
        }),
      remove: (speciesId, format) =>
        set((state) => ({
          items: state.items.filter(
            (it) => keyOf(it.speciesId, it.format) !== keyOf(speciesId, format),
          ),
        })),
      replace: (items) => set({ items }),
      clear: () => set({ items: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Persist only the items — drawer state is ephemeral, hydrated
      // is a runtime flag.
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/**
 * Validates an arbitrary unknown payload against `cartSchema` and returns
 * the parsed array, or `[]` if invalid. Used by the server-cart loader.
 */
export function parseCart(raw: unknown): CartLine[] {
  if (!raw) return [];
  const parsed = cartArraySchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export { cartArraySchema };

/** Total items (sum of quantities). */
export function cartCount(items: CartLine[]): number {
  return items.reduce((n, it) => n + it.quantity, 0);
}

/**
 * Computes the discounted order total in pence using the @repo/shared
 * pricing engine. `tier` defaults to `spot` (list price) until the
 * resolved buyer tier is wired through to the client (Cell 5.x).
 */
export function cartTotalPence(
  items: CartLine[],
  tier: CompanyTier = 'spot',
): number {
  if (items.length === 0) return 0;
  return calculateOrderTotal(
    items.map((it) => ({ unitPrice: it.unitPrice, quantity: it.quantity })),
    tier,
  );
}
