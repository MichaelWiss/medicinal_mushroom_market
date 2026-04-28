import type { ReactNode } from 'react';

export function Topbar({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-stretch justify-between border-b-[3px] border-dotted border-[color:var(--dot)] bg-putty">
      <div className="flex items-center border-r-[3px] border-dotted border-[color:var(--dot)] px-9 font-serif text-[15px] font-light italic tracking-wide text-ink2">
        {title}
      </div>
      {right ? <div className="flex items-stretch">{right}</div> : null}
    </header>
  );
}

const baseBtn =
  'flex items-center gap-2 whitespace-nowrap border-l-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-5 font-sans text-[10px] font-medium uppercase tracking-wider3 text-ink2 transition-colors';

export function TopbarChip({ children }: { children: ReactNode }) {
  return (
    <span
      className={`${baseBtn} cursor-default font-normal text-ink3`}
      role="status"
    >
      {children}
    </span>
  );
}

export function TopbarButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseBtn} cursor-pointer hover:bg-ink/5 hover:text-ink`}
    >
      {children}
    </button>
  );
}

export function TopbarCta({
  children,
  count,
  onClick,
}: {
  children: ReactNode;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 whitespace-nowrap border-l-[3px] border-dotted border-[rgba(60,50,30,0.25)] bg-yellow px-5 font-sans text-[10px] font-semibold uppercase tracking-wider3 text-navy transition-colors hover:bg-yellow2"
    >
      {children}
      {typeof count === 'number' ? (
        <span
          className="inline-flex items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-yellow"
          style={{ width: 22, height: 22 }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
