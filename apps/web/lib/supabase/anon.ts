import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@repo/db';

/**
 * Anonymous Supabase client for static / ISR rendering paths.
 *
 * Unlike `lib/supabase/server.ts`, this client is NOT cookie-bound, so it
 * will not call `cookies()` and therefore will not opt the route out of
 * static rendering. Use only for data that is anon-readable under RLS
 * (currently: `species` and passing `batches`, after Cell 2.4's migration).
 *
 * Do NOT use this for any request that needs to be scoped to the signed-in
 * buyer — it carries no session.
 */
export function createAnonClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
