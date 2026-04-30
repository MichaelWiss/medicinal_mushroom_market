import Link from 'next/link';
import type { Route } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { loadSubscriptions } from '@/lib/data/subscriptions';
import { SubscriptionsList } from '@/components/subscriptions/SubscriptionsList';

export const dynamic = 'force-dynamic';

const FREQ_LABEL: Record<'weekly' | 'biweekly' | 'monthly', string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

const FORMAT_LABEL: Record<string, string> = {
  fresh: 'Fresh fruiting body',
  powder: 'Dried powder',
  spawn: 'Grain spawn',
  culture: 'Liquid culture',
  block: 'Substrate block',
};

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function SubscriptionsPage() {
  const rows = await loadSubscriptions();
  const initial = rows.map((r) => ({
    id: r.id,
    name: r.speciesName,
    meta: `${FORMAT_LABEL[r.format] ?? r.format} · ${FREQ_LABEL[r.frequency]} · Next ${formatDate(r.nextDispatch)}`,
    qty: r.quantity,
    on: r.active,
  }));
  const activeCount = initial.filter((s) => s.on).length;

  return (
    <>
      <PageHeader
        label="Recurring orders"
        title="Sub-"
        italicSuffix="scriptions"
        description="Auto-allocated every Monday by priority tier. Pause, resume, or cancel any line."
        stat={{ value: activeCount, label: 'Active lines' }}
      />

      <div className="subs-wrap">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-v">{rows.length}</div>
            <div className="kpi-l">Total lines</div>
          </div>
          <div className="kpi">
            <div className="kpi-v">{activeCount}</div>
            <div className="kpi-l">Active</div>
          </div>
          <div className="kpi">
            <div className="kpi-v">Mon</div>
            <div className="kpi-l">Dispatch day</div>
          </div>
          <div className="kpi">
            <div className="kpi-v">
              <Link href={'/subscriptions/new' as Route}>+ New</Link>
            </div>
            <div className="kpi-l">Add line</div>
          </div>
        </div>

        {initial.length === 0 ? (
          <p style={{ marginTop: 32 }}>
            No subscriptions yet.{' '}
            <Link href={'/subscriptions/new' as Route}>Create your first</Link>{' '}
            to receive a recurring weekly dispatch.
          </p>
        ) : (
          <SubscriptionsList initial={initial} />
        )}
      </div>
    </>
  );
}
