import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@repo/db';

/**
 * ⚠️ Service-role Supabase client — BYPASSES Row-Level Security.
 *
 * USE ONLY in:
 *   - `app/api/admin/**` route handlers
 *   - server-only scripts (seeders, migrations, cron jobs)
 *
 * NEVER import from:
 *   - `app/(storefront)/**`
 *   - `app/(dashboard)/**`
 *   - any client component (`'use client'`)
 *
 * The `server-only` guard above will fail the build if this file ends up
 * in a client bundle. An ESLint `no-restricted-imports` rule additionally
 * forbids importing this module from public route groups.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
