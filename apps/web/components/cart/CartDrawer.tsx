'use client';

// Cart drawer overlay — mirrors /demo/myellium.html (lines 818-830 + JS
// `renderCart`). Uses CartProvider context.

import { BG, FMT, IMGS, speciesById } from '@/lib/data/species';
import { useCart } from './CartProvider';
import { useToast } from '@/components/ui/ToastProvider';

const AGREEMENT_DISCOUNT = 0.9;

export function CartDrawer() {
  const { lines, total, open, setOpen, remove } = useCart();
  const { toast } = useToast();

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
          {lines.length === 0 ? (
            <div className="dr-empty">Your cart is empty</div>
          ) : (
            lines.map((l) => {
              const sp = speciesById(l.id);
              if (!sp) return null;
              const linePrice = sp.price * l.qty * AGREEMENT_DISCOUNT;
              return (
                <div className="ci" key={l.id}>
                  <div
                    className="ci-img"
                    style={{
                      backgroundImage: `url('${IMGS[sp.key]}')`,
                      backgroundColor: BG[sp.key],
                    }}
                  />
                  <div className="ci-body">
                    <div className="ci-name">{sp.name}</div>
                    <div className="ci-detail">
                      {sp.formats[0] ? FMT[sp.formats[0]] : ''} · {sp.batch} · ×{l.qty}
                    </div>
                    <div className="ci-price">£{linePrice.toFixed(2)}</div>
                  </div>
                  <button
                    type="button"
                    className="ci-rm"
                    onClick={() => remove(l.id)}
                    aria-label={`Remove ${sp.name}`}
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
            <span className="dr-t-lbl">Total — Agreement −10%</span>
            <span className="dr-t-val">£{total.toFixed(2)}</span>
          </div>
          <button type="button" className="dr-cta" onClick={checkout}>
            Proceed to checkout
          </button>
          <div className="dr-note">Cold-chain dispatch every Monday</div>
        </div>
      </aside>
    </div>
  );
}
