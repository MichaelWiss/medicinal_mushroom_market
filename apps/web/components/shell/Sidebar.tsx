'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { MoleculeArt } from './MoleculeArt';

type NavItem = { label: string; href: Route; small?: boolean };

const PRIMARY: NavItem[] = [
  { label: 'Catalogue', href: '/' as Route },
  { label: 'Subscriptions', href: '/subscriptions' as Route },
];

const SECONDARY: NavItem[] = [
  { label: 'Orders', href: '/orders' as Route },
  { label: 'Traceability', href: '/traceability' as Route },
  { label: 'Bulk quotes', href: '/quotes' as Route, small: true },
];

export function Sidebar({
  open,
  onToggle,
  onClose,
  accountName = 'NovaBrew Labs',
  accountTier = 'Agreement tier',
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  accountName?: string;
  accountTier?: string;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);
  // Demo behaviour: clicking a nav link auto-closes the sidebar.
  const handleNavClick = () => {
    if (open) onClose();
  };

  return (
    <aside
      className="sticky top-0 z-50 flex h-screen flex-row overflow-hidden bg-navy"
      style={{ transition: 'width .3s ease' }}
    >
      {/* Dark panel — flex-1 fills sidebar minus the strip */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Molecule art (visible only when collapsed) */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-150"
          style={{ opacity: open ? 0 : 1 }}
        >
          <MoleculeArt />
        </div>

        {/* Nav content (visible only when open) */}
        <div
          className="flex flex-1 flex-col overflow-hidden transition-opacity duration-200"
          style={{
            opacity: open ? 1 : 0,
            pointerEvents: open ? 'all' : 'none',
            transitionDelay: open ? '150ms' : '0ms',
          }}
        >
          <div className="px-9 pb-7 pt-9 border-b-[3px] border-dotted border-white/15">
            <div className="font-serif text-[20px] font-light leading-[1.1] text-white/90">
              Mycelium <i className="not-italic font-light italic text-yellow">Supply Co.</i>
            </div>
            <div className="mt-1.5 text-[9px] font-normal uppercase tracking-wider5 text-white/30">
              B2B Spawn &amp; Extract
            </div>
          </div>

          <nav className="flex-1 pt-8">
            {PRIMARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={`block whitespace-nowrap px-9 py-3 text-[22px] font-normal uppercase tracking-wider3 transition-colors ${
                  isActive(item.href)
                    ? 'text-white/95'
                    : 'text-white/55 hover:text-white/90'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <hr className="mx-0 my-4 mt-4 border-0 border-t-[3px] border-dotted border-white/10" />
            {SECONDARY.map((item) =>
              item.small ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className="block whitespace-nowrap px-9 py-2.5 text-[13px] font-light tracking-wide text-white/35 transition-colors hover:text-white/70"
                >
                  {item.label}
                </Link>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick}
                  className={`block whitespace-nowrap px-9 py-3 text-[22px] font-normal uppercase tracking-wider3 transition-colors ${
                    isActive(item.href)
                      ? 'text-white/95'
                      : 'text-white/55 hover:text-white/90'
                  }`}
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>

          <div className="border-t-[3px] border-dotted border-white/10 px-9 pb-7 pt-5">
            <div className="text-[13px] font-light text-white/55">{accountName}</div>
            <span className="mt-1.5 inline-block bg-yellow px-2.5 py-[3px] text-[9px] font-medium uppercase tracking-wider3 text-navy">
              {accountTier}
            </span>
          </div>
        </div>
      </div>

      {/* Yellow strip — always visible, click to toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className={`relative flex w-14 shrink-0 cursor-pointer select-none flex-col items-center justify-start border-l-[3px] border-dotted bg-yellow pt-5 ${
          open ? 'border-white/10' : 'border-ink/20'
        }`}
      >
        <span
          className="mb-3.5 text-[10px] font-medium uppercase tracking-wider5 text-navy"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
        >
          {open ? 'Close' : 'Menu'}
        </span>
        <span className="block h-2.5 w-2.5 shrink-0 bg-navy" />
      </button>
    </aside>
  );
}
