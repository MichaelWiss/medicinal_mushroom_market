import { PageHeader } from '@/components/shell/PageHeader';
import { SubscriptionsList, type SubLine } from '@/components/subscriptions/SubscriptionsList';

// Static placeholder data mirroring /demo/myellium.html (lines 678-702 + JS
// `subs = [...]`). Real data wires up in Cell 2.6 (subscriptions).
const SUBS: SubLine[] = [
  {
    name: "Lion's Mane",
    meta: 'Fresh fruiting body · Weekly · Next 28 Apr 2026',
    qty: 4,
    on: true,
  },
  {
    name: 'Reishi',
    meta: 'Dried powder 500g · Biweekly · Next 05 May 2026',
    qty: 2,
    on: true,
  },
  {
    name: 'Turkey Tail',
    meta: 'Dried powder 1kg · Monthly · Next 05 May 2026',
    qty: 3,
    on: true,
  },
  {
    name: 'Cordyceps',
    meta: 'Grain spawn · Monthly · Next 05 May 2026',
    qty: 1,
    on: false,
  },
];

export default function SubscriptionsPage() {
  return (
    <>
      <PageHeader
        label="Recurring orders"
        title="Sub-"
        italicSuffix="scriptions"
        description="Auto-allocated every Monday by priority tier. Agreement discount applied to all lines."
        stat={{ value: SUBS.filter((s) => s.on).length, label: 'Active lines' }}
      />

      <div className="subs-wrap">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-v">£3,240</div>
            <div className="kpi-l">Monthly value</div>
            <div className="kpi-d">−10% agreement</div>
          </div>
          <div className="kpi">
            <div className="kpi-v">Mon</div>
            <div className="kpi-l">Dispatch day</div>
          </div>
          <div className="kpi">
            <div className="kpi-v">Tier 2</div>
            <div className="kpi-l">Allocation priority</div>
          </div>
          <div className="kpi">
            <div className="kpi-v">0</div>
            <div className="kpi-l">Backorders</div>
            <div className="kpi-d">All lines allocated</div>
          </div>
        </div>

        <SubscriptionsList initial={SUBS} />
      </div>
    </>
  );
}
