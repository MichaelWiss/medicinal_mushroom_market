// Team page (Cell 5.3). Lists every member of the caller's company
// and surfaces invite / role / remove controls when the caller is
// an admin. Buyers see a read-only roster (and the page itself is
// the same — no extra route needed).

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveSiteOrigin } from '@/lib/auth/origin';
import { loadTeamMembers } from '@/lib/data/team';
import { TeamTable } from './TeamTable';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/team');

  const { data: me } = await supabase
    .from('company_users')
    .select('company_id, role, companies(name)')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!me) redirect('/sign-in?next=/team');

  const isAdmin = me.role === 'admin';
  const companyName = (me.companies as { name: string } | null)?.name ?? 'Your company';

  const members = await loadTeamMembers(me.company_id);

  // Capture the request origin so the client invite form can hand
  // it back to the Server Action (needed to build the magic-link
  // redirect target without leaking it from the client bundle).
  // Goes through the trusted-origin resolver so a poisoned Host can't
  // redirect a buyer to an attacker domain.
  const hdrs = await headers();
  const origin = resolveSiteOrigin({
    headers: { get: (k: string) => hdrs.get(k) },
  });

  return (
    <section className="px-11 py-10">
      <div className="text-[10px] uppercase tracking-wider5 text-ink3">
        Account
      </div>
      <h1 className="mt-2 font-serif text-[28px] font-light italic text-ink">
        {companyName} team
      </h1>
      <p className="mt-2 text-[12px] text-ink2">
        {isAdmin
          ? 'Invite buyers, change roles, and revoke access. Only admins can make changes.'
          : 'Roster of users on your company account. Contact an admin to make changes.'}
      </p>

      <TeamTable
        members={members}
        currentUserId={user.id}
        isAdmin={isAdmin}
        origin={origin}
      />
    </section>
  );
}
