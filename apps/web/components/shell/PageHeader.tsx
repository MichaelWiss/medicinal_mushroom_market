import type { ReactNode } from 'react';

export function PageHeader({
  label,
  title,
  italicSuffix,
  description,
  stat,
}: {
  label: string;
  title: string;
  italicSuffix?: string;
  description?: string;
  stat?: { value: ReactNode; label: string };
}) {
  return (
    <div className="border-b-[3px] border-dotted border-[color:var(--dot)] px-11 pb-10 pt-12">
      <div className="mb-3.5 text-[9px] font-normal uppercase tracking-wider5 text-ink3">
        {label}
      </div>
      <div className="flex items-end justify-between gap-5">
        <div>
          <h1 className="font-serif text-[52px] font-light leading-[0.95] text-ink">
            {title}
            {italicSuffix ? (
              <>
                <br />
                <i className="italic">{italicSuffix}</i>
              </>
            ) : null}
          </h1>
          {description ? (
            <p className="mt-3.5 max-w-[400px] text-[13px] leading-[1.6] text-ink2">
              {description}
            </p>
          ) : null}
        </div>
        {stat ? (
          <div className="text-right">
            <div className="font-serif text-5xl font-light italic leading-none text-ink">
              {stat.value}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider4 text-ink3">
              {stat.label}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
