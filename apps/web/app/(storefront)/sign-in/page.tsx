import { redirect } from 'next/navigation';
import type { Route } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { createClient } from '@/lib/supabase/server';
import { SignInForm } from './SignInForm';

// Storefront sign-in page. If the visitor is already authenticated, jump
// straight to the requested next path (defaults to /orders).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = sanitizeNext(params.next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Cast: typedRoutes can't infer arbitrary redirect targets; we already
  // sanitized to a same-origin path.
  if (user) redirect(next as Route);

  return (
    <>
      <PageHeader
        label="Buyer access"
        title="Sign"
        italicSuffix="in"
        description="Wholesale access is invitation-only. Enter the email address tied to your company account and we'll send a single-use magic link."
      />
      <div className="px-11 py-12">
        <div className="max-w-[480px]">
          <SignInForm next={next} />
        </div>
      </div>
    </>
  );
}

// Only allow same-origin paths to prevent open-redirects via ?next=.
function sanitizeNext(raw: string | undefined): string {
  if (!raw) return '/orders';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/orders';
  return raw;
}
