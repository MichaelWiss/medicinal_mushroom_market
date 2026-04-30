// Net-30 eligibility loader (Cell 5.1).
//
// Server-side helper used by the cart page to decide whether to
// render the "Pay on Net-30 invoice" CTA. Returns `false` for
// signed-out users / users without a company; the DB trigger
// `net30_guard` plus the server-action's own check are the actual
// security boundary.

import 'server-only';
import { createClient } from '@/lib/supabase/server';

export async function loadNet30Eligibility(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('company_users')
    .select('companies(net30_enabled)')
    .eq('user_id', user.id)
    .maybeSingle();

  const company = data?.companies as { net30_enabled: boolean } | null;
  return company?.net30_enabled === true;
}
