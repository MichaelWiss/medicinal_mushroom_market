'use client';

// Create-subscription form (Cell 4.2). Posts via the
// `createSubscription` server action and pushes the user back to the
// list on success. Minimal, schema-only — visual polish can come later.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSubscription } from '@/app/actions/subscriptions';
import type { SubscribableSpecies } from '@/lib/data/subscriptions';
import type { FormatKey } from '@/lib/data/species';

const FORMAT_LABEL: Record<string, string> = {
  fresh: 'Fresh fruiting body',
  powder: 'Dried powder',
  spawn: 'Grain spawn',
  culture: 'Liquid culture',
  block: 'Substrate block',
};

const FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const;

export function NewSubscriptionForm({
  species,
}: {
  species: SubscribableSpecies[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [speciesId, setSpeciesId] = useState(species[0]?.id ?? '');
  const selected = species.find((s) => s.id === speciesId) ?? species[0];
  const [format, setFormat] = useState<FormatKey>(
    (selected?.formats[0] ?? 'fresh') as FormatKey,
  );
  const [quantity, setQuantity] = useState(1);
  const [frequency, setFrequency] =
    useState<(typeof FREQUENCIES)[number]>('weekly');

  function onSpeciesChange(id: string) {
    setSpeciesId(id);
    const next = species.find((s) => s.id === id);
    if (next?.formats[0]) setFormat(next.formats[0]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSubscription({
        speciesId,
        format,
        quantity,
        frequency,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/subscriptions');
      router.refresh();
    });
  }

  if (species.length === 0) {
    return <p>No species available right now. Try again later.</p>;
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: 'grid',
        gap: 16,
        maxWidth: 480,
        marginTop: 24,
      }}
    >
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          Species
        </span>
        <select
          value={speciesId}
          onChange={(e) => onSpeciesChange(e.target.value)}
          disabled={pending}
        >
          {species.map((s) => (
            <option key={s.id} value={s.id}>
              {s.commonName}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          Format
        </span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as FormatKey)}
          disabled={pending}
        >
          {selected?.formats.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f] ?? f}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          Quantity per dispatch
        </span>
        <input
          type="number"
          min={1}
          max={1000}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value) || 1)}
          disabled={pending}
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          Frequency
        </span>
        <select
          value={frequency}
          onChange={(e) =>
            setFrequency(e.target.value as (typeof FREQUENCIES)[number])
          }
          disabled={pending}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p style={{ color: '#7a3030', fontSize: 13 }}>{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          background: '#0b1d3a',
          color: '#fff',
          padding: '12px 24px',
          border: 0,
          borderRadius: 4,
          fontSize: 13,
          textTransform: 'uppercase',
          letterSpacing: 1,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {pending ? 'Creating…' : 'Create subscription'}
      </button>
    </form>
  );
}
