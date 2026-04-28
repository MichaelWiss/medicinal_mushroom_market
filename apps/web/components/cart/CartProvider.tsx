'use client';

// Cart context — mirrors the demo's `cart`, `addCart`, `rmCart`,
// `renderCart` helpers. State persists to localStorage so the drawer survives
// page navigation. Real backed-cart wiring lands in Cell 2.7 (orders).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { speciesById } from '@/lib/data/species';
import { useToast } from '@/components/ui/ToastProvider';

const STORAGE_KEY = 'mycelium.cart.v1';
const AGREEMENT_DISCOUNT = 0.9; // demo applies a flat -10% agreement price

export type CartLine = { id: number; qty: number };

type CartCtx = {
  lines: CartLine[];
  count: number;
  total: number;
  open: boolean;
  add: (id: number) => void;
  remove: (id: number) => void;
  setOpen: (open: boolean) => void;
};

const Ctx = createContext<CartCtx | null>(null);

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside <CartProvider>');
  return c;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage once on the client.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // ignore quota errors
    }
  }, [lines, hydrated]);

  const add = useCallback(
    (id: number) => {
      const sp = speciesById(id);
      if (!sp) return;
      setLines((prev) => {
        const i = prev.findIndex((l) => l.id === id);
        if (i === -1) return [...prev, { id, qty: 1 }];
        const next = [...prev];
        next[i] = { id, qty: next[i].qty + 1 };
        return next;
      });
      toast(`${sp.name} added to cart`);
    },
    [toast],
  );

  const remove = useCallback((id: number) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const { count, total } = useMemo(() => {
    let c = 0;
    let t = 0;
    for (const l of lines) {
      const sp = speciesById(l.id);
      if (!sp) continue;
      c += l.qty;
      t += sp.price * l.qty * AGREEMENT_DISCOUNT;
    }
    return { count: c, total: t };
  }, [lines]);

  const value = useMemo(
    () => ({ lines, count, total, open, add, remove, setOpen }),
    [lines, count, total, open, add, remove],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
