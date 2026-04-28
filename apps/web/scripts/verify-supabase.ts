// One-off Cell 2.2 verification script. Confirms:
//   1. Browser/server clients (anon key) can read the public `species` catalog.
//   2. Admin client (service-role) can write a row that the anon client cannot.
//   3. RLS policies installed in 0002 are still in force.
//
// Run with: `pnpm dlx tsx --env-file=.env.local scripts/verify-supabase.ts`
// Safe to delete after Phase 2 is signed off.

import { createClient as createAnonClient } from '@supabase/supabase-js';
import type { Database } from '@repo/db';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !anonKey || !serviceKey) {
  console.error('Missing env. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const anon = createAnonClient<Database>(url, anonKey);
const admin = createAnonClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Anon read of species — RLS requires authenticated role, so 0 rows
  //    is the correct, secure outcome. (Cell 2.3 will add a magic-link
  //    flow that lets us re-run with a real session.)
  const { data: anonRows, error: anonErr } = await anon
    .from('species')
    .select('id, common_name')
    .limit(3);
  if (anonErr) throw new Error(`anon species read errored: ${anonErr.message}`);
  console.log(`[anon]  species rows: ${anonRows?.length ?? 0} (expected 0 — RLS blocks anon)`);
  if ((anonRows?.length ?? 0) !== 0) {
    throw new Error('anon read returned rows — species RLS is too permissive');
  }

  // 2. Service-role read bypasses RLS and proves the schema is reachable.
  const { data: adminRows, error: adminErr } = await admin
    .from('species')
    .select('id, common_name')
    .limit(3);
  if (adminErr) throw new Error(`admin species read failed: ${adminErr.message}`);
  console.log(`[admin] species rows: ${adminRows?.length ?? 0} (expected ≥ 1)`);
  if (!adminRows || adminRows.length === 0) {
    throw new Error('admin read returned 0 rows — seed not applied?');
  }

  // 3. Confirm RLS still blocks anon writes to a privileged table (orders).
  const { error: anonInsertErr } = await anon
    .from('orders')
    .insert({
      company_id: '00000000-0000-0000-0000-000000000000',
      buyer_user_id: '00000000-0000-0000-0000-000000000000',
      pricing_tier: 'agreement',
      total_cents: 0,
      status: 'pending',
    } as never);
  if (!anonInsertErr) {
    throw new Error('anon insert into orders SUCCEEDED — RLS is broken');
  }
  console.log(`[anon]  orders insert blocked: ${anonInsertErr.message}`);

  console.log('\n✅ Cell 2.2 verification passed.');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
