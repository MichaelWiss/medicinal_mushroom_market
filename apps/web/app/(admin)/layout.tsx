// Providers + Shell live in the root layout.
//
// This layout is the single ops-role enforcement point for the
// `(admin)` route group (i.e. /console/**). It runs before every
// admin server component, calls `requireOps()`, and redirects to
// /sign-in if the caller is not in `public.ops_users`.
//
// Buyer-only sessions therefore see /console redirect to sign-in
// rather than the rich admin views the service-role loaders return.
// Server Actions invoked from /console pages still call requireOps()
// individually (defence in depth).

import { redirect } from 'next/navigation';
import { requireOps } from '@/lib/auth/require-ops';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const guard = await requireOps();
  if (!guard.ok) {
    redirect('/sign-in?next=/console');
  }
  return <>{children}</>;
}
