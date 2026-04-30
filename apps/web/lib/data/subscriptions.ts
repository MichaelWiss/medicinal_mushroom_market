// Subscriptions data loader (Cell 4.2).
//
// Reads via the cookie-bound server client so RLS scopes the result
// to the signed-in user's company. Joins species so the dashboard
// can show "Lion's Mane · culture · weekly · next 04 May 2026"
// without a second round-trip.

import { createClient } from '@/lib/supabase/server';
import { presentationFor } from './species-presentation';
import type { FormatKey } from './species';

export type SubscriptionRow = {
  id: string;
  speciesId: string;
  speciesName: string;
  format: string;
  quantity: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  priorityTier: number;
  nextDispatch: string; // ISO yyyy-mm-dd
  active: boolean;
  stripeSubId: string | null;
};

export async function loadSubscriptions(): Promise<SubscriptionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      'id, species_id, format, quantity, frequency, priority_tier, next_dispatch, active, stripe_sub_id, species:species_id(common_name)',
    )
    .order('active', { ascending: false })
    .order('next_dispatch', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const sp = row.species as { common_name?: string } | null | undefined;
    return {
      id: row.id,
      speciesId: row.species_id,
      speciesName: sp?.common_name ?? 'Unknown species',
      format: row.format,
      quantity: row.quantity,
      frequency: row.frequency,
      priorityTier: row.priority_tier,
      nextDispatch: row.next_dispatch,
      active: row.active,
      stripeSubId: row.stripe_sub_id,
    };
  });
}

export type SubscribableSpecies = {
  id: string;
  commonName: string;
  latinName: string;
  formats: FormatKey[];
  /** Per-unit list price in pence. */
  unitPricePence: number;
};

/** Species + their available formats for the "new subscription" form. */
export async function loadSubscribableSpecies(): Promise<
  SubscribableSpecies[]
> {
  const supabase = await createClient();
  const { data: species, error: spErr } = await supabase
    .from('species')
    .select('id, common_name, latin_name')
    .order('common_name');
  if (spErr || !species) return [];

  return species.map((s) => {
    const p = presentationFor(s.latin_name);
    return {
      id: s.id,
      commonName: s.common_name,
      latinName: s.latin_name,
      formats: p.formats,
      unitPricePence: Math.round(p.price * 100),
    };
  });
}
