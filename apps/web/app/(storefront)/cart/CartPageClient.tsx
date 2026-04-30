'use client';

// Cart page (Cell 3.2 + 3.3) — full-page view of the same Zustand store
// that powers the topbar drawer. Shows per-line discounted price via
// `calculateLinePrice` and an order subtotal/discount/total via
// `calculateOrderTotal`. The Proceed-to-checkout CTA invokes the
// `startCheckout` Server Action which validates stock + dispatch window
// against live Supabase data and redirects to a Stripe-hosted Checkout
// Session.
//
// Tier is hard-coded to `spot` for client-side display; the Server
// Action resolves the buyer's real tier from `company_users` so the
// authoritative pricing happens server-side.

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { PageHeader } from '@/components/shell/PageHeader';
import { FMT } from '@/lib/data/species';
import { useCartStore, cartCount } from '@/lib/cart/store';
import { calculateLinePrice, calculateOrderTotal } from '@repo/shared';
import { startCheckout } from '@/app/actions/checkout';
import { startNet30Checkout } from '@/app/actions/net30-checkout';
import { nextMonday, toISODate } from '@/lib/checkout/dispatch';
import { useToast } from '@/components/ui/ToastProvider';

const TIER = 'spot' as const;

const fmtGBP = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function CartPageClient({ net30Enabled }: { net30Enabled: boolean }) {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const defaultDispatch = useMemo(() => toISODate(nextMonday()), []);
  const [dispatchDate, setDispatchDate] = useState(defaultDispatch);

  // Surface a toast when the user returns from a cancelled Stripe session.
  useEffect(() => {
    if (search.get('checkout') === 'cancelled') {
      toast('Checkout cancelled — your cart is still here.');
      router.replace('/cart');
    }
  }, [search, router, toast]);

  const count = cartCount(items);
  const undiscounted = items.reduce(
    (n, it) => n + it.unitPrice * it.quantity,
    0,
  );
  const total =
    items.length === 0
      ? 0
      : calculateOrderTotal(
          items.map((it) => ({
            unitPrice: it.unitPrice,
            quantity: it.quantity,
          })),
          TIER,
        );
  const discount = undiscounted - total;

  // Gate the cart body until the Zustand `persist` middleware has
  // rehydrated from localStorage. Without this, the SSR/static markup
  // (empty cart) and the client's first render (populated from storage)
  // diverge → React #418 hydration mismatch.
  const showEmpty = hydrated && items.length === 0;
  const showItems = hydrated && items.length > 0;

  return (
    <>
      <PageHeader
        label="Your selection"
        title="Cart"
        italicSuffix="& checkout"
        description="Review your selection. Volume pricing applies per line at 10, 50, 100, and 500 units."
        stat={{ value: hydrated ? count : 0, label: count === 1 ? 'item' : 'items' }}
      />

      <div className="px-11 py-10">
        {!hydrated ? (
          <div
            className="border-[3px] border-dotted border-[color:var(--dot)] px-10 py-16 text-center text-[10px] uppercase tracking-wider5 text-ink3"
            aria-busy="true"
          >
            Loading cart…
          </div>
        ) : showEmpty ? (
          <div className="border-[3px] border-dotted border-[color:var(--dot)] px-10 py-16 text-center">
            <div className="font-serif text-[28px] font-light italic text-ink">
              Your cart is empty
            </div>
            <p className="mt-3 text-[13px] text-ink2">
              Browse the catalogue to add inoculation-dated, contamination-checked
              species.
            </p>
            <Link
              href={'/' as Route}
              className="mt-6 inline-block bg-navy px-6 py-3 text-[10px] font-medium uppercase tracking-wider5 text-white hover:bg-[color:var(--navy2)]"
            >
              Browse catalogue
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <div className="border-y-[3px] border-dotted border-[color:var(--dot)]">
                {items.map((l, idx) => {
                  const linePence = calculateLinePrice(
                    l.unitPrice,
                    l.quantity,
                    TIER,
                  );
                  const undiscLine = l.unitPrice * l.quantity;
                  const lineDiscount = undiscLine - linePence;
                  return (
                    <div
                      key={`${l.speciesId}:${l.format}`}
                      className={
                        'grid grid-cols-[1fr_auto_auto_auto] items-center gap-6 px-2 py-6' +
                        (idx > 0
                          ? ' border-t-[3px] border-dotted border-[color:var(--dot)]'
                          : '')
                      }
                    >
                      <div>
                        <div className="text-[15px] text-ink">{l.speciesName}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-wider5 text-ink3">
                          {FMT[l.format]} · {fmtGBP(l.unitPrice)} / unit
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="qb"
                          onClick={() =>
                            setQty(l.speciesId, l.format, l.quantity - 1)
                          }
                          aria-label={`Decrease ${l.speciesName} quantity`}
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
                          aria-label={`Increase ${l.speciesName} quantity`}
                        >
                          +
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="font-serif text-[18px] italic text-ink">
                          {fmtGBP(linePence)}
                        </div>
                        {lineDiscount > 0 ? (
                          <div className="mt-1 text-[10px] uppercase tracking-wider5 text-ink3">
                            Saved {fmtGBP(lineDiscount)}
                          </div>
                        ) : null}
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
                })}
              </div>

              <div className="mt-6 flex justify-between text-[10px] uppercase tracking-wider5 text-ink3">
                <Link href={'/' as Route} className="hover:text-ink">
                  ← Continue browsing
                </Link>
                <button
                  type="button"
                  onClick={clear}
                  className="hover:text-ink"
                >
                  Empty cart
                </button>
              </div>
            </div>

            <aside className="h-fit border-[3px] border-dotted border-[color:var(--dot)] p-7">
              <div className="text-[10px] uppercase tracking-wider5 text-ink3">
                Order summary
              </div>

              <div className="mt-5 space-y-3 text-[12px] text-ink2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{fmtGBP(undiscounted)}</span>
                </div>
                {discount > 0 ? (
                  <div className="flex justify-between text-ink">
                    <span>Volume discount</span>
                    <span>−{fmtGBP(discount)}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex items-baseline justify-between border-t-[3px] border-dotted border-[color:var(--dot)] pt-5">
                <span className="text-[10px] uppercase tracking-wider5 text-ink3">
                  Total
                </span>
                <span className="font-serif text-[28px] font-light italic text-ink">
                  {fmtGBP(total)}
                </span>
              </div>

              <div className="mt-6 space-y-2">
                <label
                  htmlFor="dispatch-date"
                  className="block text-[10px] uppercase tracking-wider5 text-ink3"
                >
                  Dispatch date
                </label>
                <input
                  id="dispatch-date"
                  type="date"
                  value={dispatchDate}
                  min={defaultDispatch}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink focus:outline-none focus:border-[color:var(--ink2)]"
                />
                <p className="text-[10px] text-ink3">
                  Cold-chain species dispatch on Mondays only.
                </p>
              </div>

              {error ? (
                <div
                  role="alert"
                  className="mt-4 border-[3px] border-dotted border-red-700 px-4 py-3 text-[12px] text-red-800"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="button"
                className="dr-cta mt-6 w-full"
                disabled={pending || items.length === 0}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await startCheckout({
                      items,
                      dispatchDate,
                    });
                    if (!res.ok) {
                      if (res.code === 'unauthenticated') {
                        router.push('/sign-in?next=/cart');
                        return;
                      }
                      setError(res.error);
                      return;
                    }
                    window.location.assign(res.url);
                  });
                }}
              >
                {pending ? 'Redirecting…' : 'Proceed to checkout'}
              </button>
              {net30Enabled ? (
                <button
                  type="button"
                  className="mt-3 w-full border-[3px] border-dotted border-[color:var(--ink2)] bg-transparent px-6 py-3 text-[10px] font-medium uppercase tracking-wider5 text-ink hover:bg-[color:var(--paper2)] disabled:opacity-50"
                  disabled={pending || items.length === 0}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const res = await startNet30Checkout({
                        items,
                        dispatchDate,
                      });
                      if (!res.ok) {
                        if (res.code === 'unauthenticated') {
                          router.push('/sign-in?next=/cart');
                          return;
                        }
                        setError(res.error);
                        return;
                      }
                      clear();
                      toast(`Invoice ${res.invoiceNumber} emailed`);
                      router.push(`/orders/${res.orderId}` as Route);
                    });
                  }}
                >
                  {pending ? 'Submitting…' : 'Pay on Net-30 invoice'}
                </button>
              ) : null}
              <div className="mt-3 text-center text-[10px] uppercase tracking-wider5 text-ink3">
                Cold-chain dispatch every Monday
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
