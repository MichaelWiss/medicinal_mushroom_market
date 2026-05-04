// Ops-role gate (security plan step 3).
//
// Returns { ok: true, userId } iff the caller has an authenticated
// Supabase session AND a row in `public.ops_users`. Returns
// { ok: false, error } otherwise.
//
// Membership is read via the service-role admin client because the
// `ops_users` table has no RLS policies for authenticated/anon roles
// (deliberately — it is an allow-list, never written by buyers).
//
// Use this helper from:
//   • Server Actions that today only require a session (dispatch.ts,
//     batches.ts, dispatches.ts).
//   • The /console route group's server-component layout.
//
// NOTE: this helper imports the service-role client. The eslint
// `no-restricted-imports` rule already blocks the service-role client
// from `(storefront)` and `(dashboard)` route groups. This helper
// must therefore only be imported from `(admin)/**`, `app/api/**`,
// `app/actions/**`, or other server-only modules.

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type RequireOpsResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function requireOps(): Promise<RequireOpsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in required.' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('ops_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    // Read failure: fail closed.
    return { ok: false, error: 'Authorisation check failed.' };
  }
  if (!data) {
    return { ok: false, error: 'Ops access required.' };
  }
  return { ok: true, userId: user.id };
}
