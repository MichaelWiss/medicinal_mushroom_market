import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { loadSubscribableSpecies } from '@/lib/data/subscriptions';
import { NewSubscriptionForm } from '@/components/subscriptions/NewSubscriptionForm';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewSubscriptionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/subscriptions/new');

  const species = await loadSubscribableSpecies();

  return (
    <>
      <PageHeader
        label="New subscription"
        title="Recurring "
        italicSuffix="dispatch"
        description="Pick a species, format, and cadence. Your first dispatch is the next Monday on or after today."
      />

      <div className="subs-wrap">
        <NewSubscriptionForm species={species} />
        <p style={{ marginTop: 24 }}>
          <Link href={'/subscriptions' as Route}>← Back to subscriptions</Link>
        </p>
      </div>
    </>
  );
}
