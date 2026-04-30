'use client';

// Tiny client wrapper for the cart so the species detail page can stay a
// server component. The CartProvider lives at the app root layout.

import { useCartStore } from '@/lib/cart/store';
import type { CartItemInput } from '@repo/shared';

export function AddToCartButton({
  item,
  disabled,
  label,
}: {
  item: CartItemInput;
  disabled?: boolean;
  label: string;
}) {
  const add = useCartStore((s) => s.add);
  const setOpen = useCartStore((s) => s.setOpen);
  return (
    <button
      type="button"
      className="sp-add"
      disabled={disabled}
      onClick={() => {
        add(item);
        setOpen(true);
      }}
    >
      {label}
    </button>
  );
}
