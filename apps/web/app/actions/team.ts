// Team management Server Actions (Cell 5.3).
//
//   • inviteTeamMember  — admin invites a buyer/admin (delegates to
//     the existing /api/invites endpoint logic, inlined here for a
//     direct Server-Action call from the team page).
//   • setTeamMemberRole — change `company_users.role`.
//   • removeTeamMember  — revoke membership (deletes the
//     `company_users` row; auth.users is left intact so the
//     account can be re-invited later).
//
// Every mutation re-checks that the caller is an `admin` of the
// target row's company. RLS on `company_users` already restricts
// reads to the caller's company, but we go through the service-
// role admin client for writes so we can audit + bypass policies
// safely after the explicit role check.

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCompanyAdmin } from '@/lib/auth/require-company';

const ROLES = ['admin', 'buyer'] as const;
type Role = (typeof ROLES)[number];

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inviteSchema = z.object({
  email: z.string().regex(EMAIL_RX, 'Invalid email'),
  role: z.enum(ROLES).default('buyer'),
});

export type InviteResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function inviteTeamMember(
  raw: z.input<typeof inviteSchema>,
  redirectOrigin: string,
): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const { email, role } = parsed.data;

  const guard = await requireCompanyAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const redirectTo = `${redirectOrigin.replace(/\/$/, '')}/auth/callback?next=/orders`;
  const { data: invited, error: inviteErr } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { company_id: guard.companyId, role },
    });
  if (inviteErr || !invited.user) {
    return { ok: false, error: inviteErr?.message ?? 'Invite failed.' };
  }

  const { error: linkErr } = await admin.from('company_users').insert({
    company_id: guard.companyId,
    user_id: invited.user.id,
    role,
  });
  if (linkErr) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return { ok: false, error: `Failed to link membership: ${linkErr.message}` };
  }

  revalidatePath('/team');
  return { ok: true, userId: invited.user.id };
}

const setRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: z.enum(ROLES),
});

export async function setTeamMemberRole(
  raw: z.input<typeof setRoleSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = setRoleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const { membershipId, role } = parsed.data;

  const guard = await requireCompanyAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: target } = await admin
    .from('company_users')
    .select('id, company_id, user_id, role')
    .eq('id', membershipId)
    .maybeSingle();
  if (!target || target.company_id !== guard.companyId) {
    return { ok: false, error: 'Member not found.' };
  }
  // Don't allow demoting the last admin.
  if (target.role === 'admin' && role === 'buyer') {
    const { count } = await admin
      .from('company_users')
      .select('id', { head: true, count: 'exact' })
      .eq('company_id', guard.companyId)
      .eq('role', 'admin');
    if ((count ?? 0) <= 1) {
      return { ok: false, error: 'Cannot demote the last admin.' };
    }
  }

  const { error } = await admin
    .from('company_users')
    .update({ role })
    .eq('id', membershipId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/team');
  return { ok: true };
}

const removeSchema = z.object({ membershipId: z.string().uuid() });

export async function removeTeamMember(
  raw: z.input<typeof removeSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = removeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const { membershipId } = parsed.data;

  const guard = await requireCompanyAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: target } = await admin
    .from('company_users')
    .select('id, company_id, user_id, role')
    .eq('id', membershipId)
    .maybeSingle();
  if (!target || target.company_id !== guard.companyId) {
    return { ok: false, error: 'Member not found.' };
  }
  if (target.user_id === guard.userId) {
    return { ok: false, error: 'You cannot remove yourself.' };
  }
  if (target.role === 'admin') {
    const { count } = await admin
      .from('company_users')
      .select('id', { head: true, count: 'exact' })
      .eq('company_id', guard.companyId)
      .eq('role', 'admin');
    if ((count ?? 0) <= 1) {
      return { ok: false, error: 'Cannot remove the last admin.' };
    }
  }

  const { error } = await admin
    .from('company_users')
    .delete()
    .eq('id', membershipId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/team');
  return { ok: true };
}
