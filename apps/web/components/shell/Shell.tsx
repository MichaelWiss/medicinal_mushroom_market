'use client';

import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function Shell({
  topbarTitle,
  topbarRight,
  children,
}: {
  topbarTitle: string;
  topbarRight?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="grid min-h-screen"
      style={{
        gridTemplateColumns: open ? '320px 1fr' : '56px 1fr',
        transition: 'grid-template-columns .3s ease',
      }}
    >
      <Sidebar open={open} onToggle={() => setOpen((v) => !v)} />
      <div className="flex min-w-0 flex-col">
        <Topbar title={topbarTitle} right={topbarRight} />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
