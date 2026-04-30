'use client';

// Cart drawer overlay — mirrors /demo/myellium.html (lines 818-830 + JS
// `renderCart`). Reads from the Zustand cart store; renders real items
// with quantity steppers and the @repo/shared pricing engine total.

import Link from 'next/link';
import type { Route } from 'next';
import { FMT } from '@/lib/data/species';
import { useCartStore, cartTotalPence } from '@/lib/cart/store';
import { useToast } from '@/components/ui/ToastProvider';

const fmtGBP = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function CartDrawer() {
  const items = useCartStore((s) => s.items);
  const open = useCartStore((s) => s.open);
  const setOpen = useCartStore((s) => s.setOpen);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const { toast } = useToast();

  const total = cartTotalPence(items);
  const close = () => setOpen(false);
  const checkout = () => {
    toast('Proceeding to checkout');
    close();
  };

  return (
    <div
      className={open ? 'ov open' : 'ov'}
      onClick={close}
      role="presentation"
    >
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        aria-label="Shopping cart"
      >
        <div className="dr-hd">
          <div className="dr-title">Cart</div>
          <button
            type="button"
            className="dr-close"
            onClick={close}
            aria-label="Close cart"
          >
            ✕
          </button>
        </div>

        <div className="dr-body">
          {items.length === 0 ? (
            <div className="dr-empty">Your cart is empty</div>
          ) : (
            items.map((l) => {
              const linePence = l.unitPrice * l.quantity;
              return (
                <div className="ci" key={`${l.speciesId}:${l.format}`}>
                  <div className="ci-body">
                    <div className="ci-name">{l.speciesName}</div>
                    <div className="ci-detail">
                      {FMT[l.format]} · {fmtGBP(l.unitPrice)} / unit
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className="qb"
                        onClick={() =>
                          setQty(l.speciesId, l.format, l.quantity - 1)
                        }
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span className="qv">{l.quantity}</span>
                      <button
                        type="button"
                        className="qb"
                        onClick={() =>
                          setQty(l.speciesId, l.format, l.quantity + 1)
                        }
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <div className="ci-price">{fmtGBP(linePence)}</div>
                  </div>
                  <button
                    type="button"
                    className="ci-rm"
                    onClick={() => remove(l.speciesId, l.format)}
                    aria-label={`Remove ${l.speciesName}`}
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="dr-foot">
          <div className="dr-total">
            <span className="dr-t-lbl">Subtotal</span>
            <span className="dr-t-val">{fmtGBP(total)}</span>
          </div>
          <button
            type="button"
            className="dr-cta"
            onClick={checkout}
            disabled={items.length === 0}
          >
            Proceed to checkout
          </button>
          <Link
            href={'/cart' as Route}
            onClick={close}
            className="mt-3 block text-center text-[10px] uppercase tracking-wider5 text-ink3 hover:text-ink"
          >
            View full cart
          </Link>
          <div className="dr-note">Cold-chain dispatch every Monday</div>
        </div>
      </aside>
    </div>
  );
}
