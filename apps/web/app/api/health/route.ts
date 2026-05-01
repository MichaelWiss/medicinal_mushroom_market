import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Health probe — Cell 7.4.
// Returns:
//   { db: 'ok' | 'error', last_cron_run: string | null, timestamp: string }
//
// Always responds 200 so orchestrators that gate on HTTP status still
// get a body with actionable detail. Callers should alert when
// `db === 'error'` or `last_cron_run` is stale (> 8 days for the
// Monday-only cron).
//
// Uses the service-role client so the query bypasses RLS. The
// `system_metrics` table has no anon/authenticated policies so a
// regular cookie client would silently return zero rows.
export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  let db: 'ok' | 'error' = 'error';
  let last_cron_run: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('system_metrics')
      .select('value, updated_at')
      .eq('key', 'last_cron_run')
      .maybeSingle();

    if (!error) {
      db = 'ok';
      // Empty string is the "never run" sentinel inserted by the migration.
      last_cron_run = data?.value || null;
    }
  } catch {
    // Admin client instantiation failed (missing env vars in dev).
    db = 'error';
  }

  return NextResponse.json({ db, last_cron_run, timestamp });
}
