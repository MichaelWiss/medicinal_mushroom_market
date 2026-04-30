'use client';

// Admin quote builder (Cell 5.2). Lets ops compose `line_items`,
// pick a company, set an expiry, and either save as draft or send.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { createQuote } from '@/app/actions/quotes';
import type { ProductFormat, QuoteLineItemInput } from '@repo/shared';

type CompanyRow = { id: string; name: string; tier: string; net30_enabled: boolean };
type SpeciesRow = { id: string; common_name: string; latin_name: string };

const FORMATS: ProductFormat[] = ['fresh', 'powder', 'spawn', 'culture', 'block'];

const fmtGBP = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function NewQuoteForm({
  companies,
  species,
}: {
  companies: CompanyRow[];
  species: SpeciesRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
  );
  const [lines, setLines] = useState<QuoteLineItemInput[]>([]);
  const [draft, setDraft] = useState<{
    speciesId: string;
    format: ProductFormat;
    quantity: number;
    unitPrice: number;
  }>({
    speciesId: species[0]?.id ?? '',
    format: 'fresh',
    quantity: 50,
    unitPrice: 0,
  });

  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const addLine = () => {
    const sp = species.find((s) => s.id === draft.speciesId);
    if (!sp || draft.quantity < 1 || draft.unitPrice < 0) return;
    setLines((prev) => [
      ...prev,
      {
        speciesId: sp.id,
        speciesName: sp.common_name,
        format: draft.format,
        quantity: draft.quantity,
        unitPrice: draft.unitPrice,
      },
    ]);
  };

  const removeLine = (i: number) =>
    setLines((prev) => prev.filter((_, idx) => idx !== i));

  const submit = (send: boolean) => {
    setError(null);
    if (!companyId) {
      setError('Pick a company.');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one line item.');
      return;
    }
    startTransition(async () => {
      const res = await createQuote({
        companyId,
        lineItems: lines,
        expiresAt: new Date(expiresAt).toISOString(),
        send,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/console/quotes` as Route);
    });
  };

  return (
    <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-8">
        <div className="border-[3px] border-dotted border-[color:var(--dot)] p-6">
          <div className="text-[10px] uppercase tracking-wider5 text-ink3">
            Add line item
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider5 text-ink3">
                Species
              </span>
              <select
                value={draft.speciesId}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, speciesId: e.target.value }))
                }
                className="mt-1 w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink"
              >
                {species.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.common_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider5 text-ink3">
                Format
              </span>
              <select
                value={draft.format}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, format: e.target.value as ProductFormat }))
                }
                className="mt-1 w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink"
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider5 text-ink3">
                Quantity
              </span>
              <input
                type="number"
                min={1}
                value={draft.quantity}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, quantity: Number(e.target.value) }))
                }
                className="mt-1 w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink"
              />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider5 text-ink3">
                Unit price (pence)
              </span>
              <input
                type="number"
                min={0}
                value={draft.unitPrice}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, unitPrice: Number(e.target.value) }))
                }
                className="mt-1 w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink"
              />
            </label>
          </div>
          <button
            type="button"
            className="mt-4 bg-navy px-5 py-2 text-[10px] uppercase tracking-wider3 text-white hover:bg-[color:var(--navy2)]"
            onClick={addLine}
          >
            Add line
          </button>
        </div>

        <div className="border-[3px] border-dotted border-[color:var(--dot)] p-6">
          <div className="text-[10px] uppercase tracking-wider5 text-ink3">
            Line items ({lines.length})
          </div>
          {lines.length === 0 ? (
            <p className="mt-4 text-[12px] text-ink2">No lines yet.</p>
          ) : (
            <table className="mt-4 w-full text-[12px]">
              <thead className="text-left text-[10px] uppercase tracking-wider5 text-ink3">
                <tr>
                  <th className="py-2">Species</th>
                  <th className="py-2">Format</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit</th>
                  <th className="py-2 text-right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr
                    key={i}
                    className="border-t-[3px] border-dotted border-[color:var(--dot)]"
                  >
                    <td className="py-2">{l.speciesName}</td>
                    <td className="py-2">{l.format}</td>
                    <td className="py-2 text-right">{l.quantity}</td>
                    <td className="py-2 text-right">{fmtGBP(l.unitPrice)}</td>
                    <td className="py-2 text-right">
                      {fmtGBP(l.unitPrice * l.quantity)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(i)}
                        className="text-ink3 hover:text-ink"
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <aside className="h-fit border-[3px] border-dotted border-[color:var(--dot)] p-6">
        <div className="text-[10px] uppercase tracking-wider5 text-ink3">
          Quote details
        </div>
        <label className="mt-4 block">
          <span className="text-[10px] uppercase tracking-wider5 text-ink3">
            Buyer company
          </span>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="mt-1 w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink"
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.tier}
                {c.net30_enabled ? ', net30' : ''})
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block">
          <span className="text-[10px] uppercase tracking-wider5 text-ink3">
            Expires
          </span>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 w-full border-[3px] border-dotted border-[color:var(--dot)] bg-transparent px-3 py-2 text-[12px] text-ink"
          />
        </label>
        <div className="mt-6 flex items-baseline justify-between border-t-[3px] border-dotted border-[color:var(--dot)] pt-4">
          <span className="text-[10px] uppercase tracking-wider5 text-ink3">
            Total
          </span>
          <span className="font-serif text-[22px] italic text-ink">
            {fmtGBP(total)}
          </span>
        </div>

        {error ? (
          <div className="mt-4 border-[3px] border-dotted border-red-700 px-3 py-2 text-[12px] text-red-800">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          className="mt-6 w-full border-[3px] border-dotted border-[color:var(--ink2)] bg-transparent px-5 py-2.5 text-[10px] uppercase tracking-wider3 text-ink hover:bg-[color:var(--paper2)] disabled:opacity-50"
          disabled={pending}
          onClick={() => submit(false)}
        >
          Save draft
        </button>
        <button
          type="button"
          className="mt-3 w-full bg-yellow px-5 py-2.5 text-[10px] uppercase tracking-wider3 text-navy hover:bg-yellow2 disabled:opacity-50"
          disabled={pending}
          onClick={() => submit(true)}
        >
          {pending ? 'Sending…' : 'Send to buyer'}
        </button>
      </aside>
    </div>
  );
}
