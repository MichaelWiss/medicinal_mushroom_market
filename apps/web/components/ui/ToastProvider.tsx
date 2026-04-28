'use client';

// Toast context — mirrors the demo's `toast(msg)` helper. Single transient
// message at a time, auto-dismisses after ~2.2s.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ToastCtx = { toast: (msg: string) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside <ToastProvider>');
  return c;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string>('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className={show ? 'toast show' : 'toast'} role="status" aria-live="polite">
        {msg}
      </div>
    </Ctx.Provider>
  );
}
