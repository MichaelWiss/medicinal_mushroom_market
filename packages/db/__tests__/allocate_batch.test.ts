import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/types.js';

// Local Supabase service-role key bypasses RLS so the test can seed and read
// state directly. Read from env only — never hardcode a secret. Get the
// current value via `supabase status` and export it before running tests:
//   export SUPABASE_URL=http://127.0.0.1:54321
//   export SUPABASE_SECRET_KEY=<service_role from `supabase status`>
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SERVICE_KEY) {
  throw new Error(
    'SUPABASE_SECRET_KEY env var is required. Run `supabase status` and export the service_role key.',
  );
}

const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const TEST_SPECIES_ID = 'aa000099-0000-0000-0000-000000000099';
const TEST_BATCH_ID = 'bb000099-0000-0000-0000-000000000099';

async function resetFixture(): Promise<void> {
  // Order matters: batch references species.
  await supabase.from('batches').delete().eq('id', TEST_BATCH_ID);
  await supabase.from('species').delete().eq('id', TEST_SPECIES_ID);

  const { error: speciesErr } = await supabase.from('species').insert({
    id: TEST_SPECIES_ID,
    common_name: 'Concurrency Test Mushroom',
    latin_name: 'Testus concurrentis',
    substrate_type: 'agar',
    shelf_life_days: 90,
  });
  if (speciesErr) throw speciesErr;

  const { error: batchErr } = await supabase.from('batches').insert({
    id: TEST_BATCH_ID,
    species_id: TEST_SPECIES_ID,
    inoculation_date: new Date().toISOString().slice(0, 10),
    substrate_lot: 'TEST-LOT-001',
    available_units: 10,
    contamination_check: 'pass',
  });
  if (batchErr) throw batchErr;
}

async function cleanup(): Promise<void> {
  await supabase.from('batches').delete().eq('id', TEST_BATCH_ID);
  await supabase.from('species').delete().eq('id', TEST_SPECIES_ID);
}

describe('allocate_batch — concurrent allocation', () => {
  beforeEach(resetFixture);
  afterAll(cleanup);

  it('no oversell under 50 concurrent qty=1 calls (SKIP LOCKED invariant)', async () => {
    const calls = Array.from({ length: 50 }, () =>
      supabase.rpc('allocate_batch', {
        p_species_id: TEST_SPECIES_ID,
        p_qty: 1,
      }),
    );
    const results = await Promise.all(calls);

    // No errors — every call must complete cleanly.
    const errors = results.filter((r) => r.error).map((r) => r.error);
    expect(errors).toEqual([]);

    const successes = results.filter((r) => r.data !== null);
    const nulls = results.filter((r) => r.data === null);

    // Core safety invariant: NEVER more than the 10 units available
    // (proves no oversell). At least 1 must succeed (proves we made progress).
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(successes.length).toBeLessThanOrEqual(10);
    expect(successes.length + nulls.length).toBe(50);

    // Every allocation must reference our fixture batch.
    for (const r of successes) {
      expect(r.data).toBe(TEST_BATCH_ID);
    }

    // Conservation: units consumed exactly matches units returned.
    const { data: batch, error } = await supabase
      .from('batches')
      .select('available_units')
      .eq('id', TEST_BATCH_ID)
      .single();
    expect(error).toBeNull();
    expect(batch?.available_units).toBe(10 - successes.length);
    // available_units check constraint (>= 0) on the table is the
    // ultimate backstop against oversell.
    expect(batch?.available_units).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('sequential calls drain the batch exactly to zero', async () => {
    // With no contention, all 10 units must be allocatable in sequence,
    // and the 11th call must return null (out of stock).
    const ids: (string | null)[] = [];
    for (let i = 0; i < 11; i++) {
      const { data, error } = await supabase.rpc('allocate_batch', {
        p_species_id: TEST_SPECIES_ID,
        p_qty: 1,
      });
      expect(error).toBeNull();
      ids.push(data);
    }
    expect(ids.slice(0, 10).every((x) => x === TEST_BATCH_ID)).toBe(true);
    expect(ids[10]).toBeNull();

    const { data: batch } = await supabase
      .from('batches')
      .select('available_units')
      .eq('id', TEST_BATCH_ID)
      .single();
    expect(batch?.available_units).toBe(0);
  }, 30_000);
});
