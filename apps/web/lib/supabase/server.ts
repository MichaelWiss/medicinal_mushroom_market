import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@repo/db';

/**
 * Server Supabase client — anon key + cookie-bound auth session.
 * Use from Server Components, Route Handlers, and Server Actions.
 * RLS is enforced; this client cannot bypass policies.
 *
 * Next 15: `cookies()` is async, so this helper is async too.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // Safe to ignore if middleware refreshes the session.
          }
        },
      },
    }
  );
}
