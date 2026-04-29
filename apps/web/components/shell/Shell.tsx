'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { StorefrontTopbarRight } from '@/components/cart/StorefrontTopbarRight';

// Routes that should show the storefront topbar (cart, quote CTA).
const STOREFRONT_PATHS = new Set(['/', '/subscriptions', '/quotes']);

// Mirrors /demo/myellium.html `TITLES` map (line 999). Keeps the sticky
// topbar caption in sync with the active route so behaviour matches the demo
// even though Next splits each page into its own route file.
const TITLES: Record<string, string> = {
  '/': 'Species catalogue',
  '/subscriptions': 'Subscriptions',
  '/quotes': 'Bulk quotes',
  '/orders': 'Order history',
  '/traceability': 'Batch traceability',
  '/console': 'Operations console',
};

function titleForPath(pathname: string): string {
  const exact = TITLES[pathname];
  if (exact) return exact;
  // Fall back to the longest matching prefix.
  const match = Object.keys(TITLES)
    .filter((p) => p !== '/' && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return (match && TITLES[match]) || 'Mycelium';
}

export function Shell({
  topbarTitle,
  topbarRight,
  children,
}: {
  topbarTitle?: string;
  topbarRight?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? '/';
  const title = topbarTitle ?? titleForPath(pathname);
  const right =
    topbarRight ??
    (STOREFRONT_PATHS.has(pathname) ? <StorefrontTopbarRight /> : null);

  return (
    <div
      className="grid min-h-screen"
      style={{
        gridTemplateColumns: open ? '320px 1fr' : '56px 1fr',
        transition: 'grid-template-columns .3s ease',
      }}
    >
      <Sidebar
        open={open}
        onToggle={() => setOpen((v) => !v)}
        onClose={() => setOpen(false)}
      />
      <div className="flex min-w-0 flex-col">
        <Topbar title={title} right={right} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
