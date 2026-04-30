'use client';

// Cart sync mount + selector hook (Cell 3.1).
//
// `<CartProvider>` is a render-less side-effect component:
//   - waits for the Zustand persist middleware to hydrate from localStorage,
//   - subscribes to Supabase auth changes,
//   - on SIGNED_IN: pulls the server cart; if non-empty it wins (cross-device
//     continuity), otherwise the local cart is pushed to the server,
//   - on SIGNED_OUT: clears the local store,
//   - debounces local writes back to the server while authenticated.
//
// `useCart()` is a thin selector wrapper around the Zustand store so existing
// consumers keep a familiar API surface. New code can use `useCartStore`
// directly with custom selectors.

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/browser';
import {
  cartCount,
  cartTotalPence,
  useCartStore,
  type CartLine,
} from '@/lib/cart/store';
import { loadServerCart, saveServerCart } from '@/lib/cart/sync';

const SAVE_DEBOUNCE_MS = 600;

function CartSyncEngine() {
  const isAuthedRef = useRef(false);
  const lastSavedRef = useRef<string>('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth lifecycle: SIGNED_IN merges server ↔ local; SIGNED_OUT clears local.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function onSignedIn() {
      const server = await loadServerCart();
      if (cancelled) return;
      isAuthedRef.current = true;
      const localItems = useCartStore.getState().items;

      if (server && server.length > 0) {
        // Server cart wins on first sign-in: cross-device continuity.
        useCartStore.getState().replace(server);
        lastSavedRef.current = JSON.stringify(server);
      } else if (localItems.length > 0) {
        // No server cart yet — push the local cart up.
        await saveServerCart(localItems);
        lastSavedRef.current = JSON.stringify(localItems);
      } else {
        lastSavedRef.current = '[]';
      }
    }

    function onSignedOut() {
      isAuthedRef.current = false;
      lastSavedRef.current = '';
      useCartStore.getState().clear();
    }

    // Bootstrap: check current session on mount.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) onSignedIn();
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') onSignedIn();
      if (event === 'SIGNED_OUT') onSignedOut();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Debounced server upsert when the local items change while authenticated.
  useEffect(() => {
    const unsub = useCartStore.subscribe((state, prev) => {
      if (state.items === prev.items) return;
      if (!isAuthedRef.current) return;
      const serialized = JSON.stringify(state.items);
      if (serialized === lastSavedRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const items: CartLine[] = useCartStore.getState().items;
        const ok = await saveServerCart(items);
        if (ok) lastSavedRef.current = serialized;
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsub();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  return null;
}

export function CartProvider({ children }: { children: ReactNode }) {
  return (
    <>
      <CartSyncEngine />
      {children}
    </>
  );
}

/**
 * Convenience selector for legacy consumers. New code may prefer pulling
 * narrower slices from `useCartStore` directly to minimise re-renders.
 */
export function useCart() {
  const items = useCartStore((s) => s.items);
  const open = useCartStore((s) => s.open);
  const add = useCartStore((s) => s.add);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);
  const clear = useCartStore((s) => s.clear);
  const setOpen = useCartStore((s) => s.setOpen);

  return {
    items,
    lines: items, // legacy alias
    count: cartCount(items),
    total: cartTotalPence(items),
    open,
    add,
    setQty,
    remove,
    clear,
    setOpen,
  };
}
