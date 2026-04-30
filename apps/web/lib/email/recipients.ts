// Resolve the set of buyer email addresses for a given company so the
// Stripe webhook + subscription engine can fan out transactional mail.
//
// Uses the service-role admin auth API (`auth.admin.getUserById`) since
// auth.users is not exposed via PostgREST.

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export async function getCompanyEmails(companyId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data: members, error } = await supabase
    .from('company_users')
    .select('user_id')
    .eq('company_id', companyId);
  if (error || !members || members.length === 0) return [];

  const emails: string[] = [];
  for (const { user_id } of members) {
    const { data, error: usrErr } = await supabase.auth.admin.getUserById(
      user_id,
    );
    if (usrErr || !data?.user?.email) continue;
    emails.push(data.user.email);
  }
  return emails;
}
