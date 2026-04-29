'use client';

// Tiny client wrapper for the cart so the species detail page can stay a
// server component. The CartProvider lives at the app root layout.

import { useCart } from '@/components/cart/CartProvider';

export function AddToCartButton({
  cartId,
  disabled,
  label,
}: {
  cartId: number;
  disabled?: boolean;
  label: string;
}) {
  const { add } = useCart();
  return (
    <button
      type="button"
      className="sp-add"
      disabled={disabled}
      onClick={() => add(cartId)}
    >
      {label}
    </button>
  );
}
