// Unified session + company role guards (cleanup pass — replaces the
// six near-duplicate `requireSignedIn` / `requireCompany` /
// `requireAdmin` / `requireAdminFor` thunks scattered across
// `app/actions/*.ts`).
//
// All functions return a discriminated `{ ok: true, … } | { ok: false, error, code }`
// shape so callers can early-return without exception handling.
//
// Pair with `lib/auth/require-ops.ts` for ops-role gating; that helper
// covers `/console` access and is intentionally separate.

import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CompanyTier } from '@repo/shared';

export type RequireSessionResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; error: string; code: 'unauthenticated' };

/**
 * Returns the signed-in user, or an `unauthenticated` failure. Used by
 * helpers below; rarely needed directly in actions.
 */
export async function requireSession(): Promise<RequireSessionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: 'unauthenticated', error: 'Sign in required.' };
  }
  return { ok: true, userId: user.id, email: user.email ?? null };
}

export type RequireCompanyResult =
  | {
      ok: true;
      userId: string;
      email: string | null;
      companyId: string;
      tier: CompanyTier;
    }
  | { ok: false; error: string; code: 'unauthenticated' | 'no_company' };

/**
 * Returns the caller's session + their company association (id + tier).
 * The single helper covers every cart/checkout/subscription flow that
 * used to read `company_users` and pluck `companies.tier` inline.
 */
export async function requireCompany(): Promise<RequireCompanyResult> {
  const session = await requireSession();
  if (!session.ok) return session;

  const supabase = await createClient();
  const { data: link, error } = await supabase
    .from('company_users')
    .select('company_id, companies:company_id(tier)')
    .eq('user_id', session.userId)
    .maybeSingle();
  if (error || !link?.company_id) {
    return {
      ok: false,
      code: 'no_company',
      error: 'No company is linked to this account.',
    };
  }
  const co = link.companies as { tier?: CompanyTier } | null | undefined;
  return {
    ok: true,
    userId: session.userId,
    email: session.email,
    companyId: link.company_id,
    tier: (co?.tier ?? 'spot') as CompanyTier,
  };
}

export type RequireCompanyAdminResult =
  | { ok: true; userId: string; companyId: string }
  | { ok: false; error: string; code: 'unauthenticated' | 'forbidden' };

/**
 * Returns the caller's session + company id, but only when their
 * `company_users.role` is `'admin'`.
 *
 * Pass `companyId` to enforce admin-of-that-specific-company (used by
 * the quotes flow). When omitted, returns admin-of-their-own-company
 * (used by the team management flow).
 */
export async function requireCompanyAdmin(
  companyId?: string,
): Promise<RequireCompanyAdminResult> {
  const session = await requireSession();
  if (!session.ok) return session;

  const supabase = await createClient();
  let query = supabase
    .from('company_users')
    .select('company_id, role')
    .eq('user_id', session.userId);
  if (companyId) query = query.eq('company_id', companyId);

  const { data: link } = await query.maybeSingle();
  if (!link || link.role !== 'admin') {
    return {
      ok: false,
      code: 'forbidden',
      error: 'Admin role required.',
    };
  }
  return { ok: true, userId: session.userId, companyId: link.company_id };
}
