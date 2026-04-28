'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@repo/db';

/**
 * Browser Supabase client — uses the publishable (anon) key.
 * Safe to import from any client component. Reads/writes auth cookies
 * via the @supabase/ssr browser adapter.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
