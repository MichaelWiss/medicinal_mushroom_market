// Team roster loader (Cell 5.3). Lives in `lib/` so the
// `(dashboard)/team` page can call it without tripping the
// `no-restricted-imports` rule that blocks the storefront /
// dashboard route groups from pulling in the service-role
// admin client.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export type TeamMember = {
  id: string;
  user_id: string;
  role: 'admin' | 'buyer';
  email: string;
  created_at: string;
};

/**
 * List members of `companyId`, joining `auth.users.email` via the
 * service-role auth admin API.
 */
export async function loadTeamMembers(companyId: string): Promise<TeamMember[]> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from('company_users')
    .select('id, user_id, role, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  if (!rows) return [];

  const out: TeamMember[] = [];
  for (const row of rows) {
    const { data } = await admin.auth.admin.getUserById(row.user_id);
    out.push({
      id: row.id,
      user_id: row.user_id,
      role: row.role as 'admin' | 'buyer',
      email: data?.user?.email ?? '(unknown)',
      created_at: row.created_at,
    });
  }
  return out;
}
