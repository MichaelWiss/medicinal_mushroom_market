import { PageHeader } from '@/components/shell/PageHeader';

// Mirrors /demo/myellium.html `renderOrders()` (lines 932-947). Real order
// history wires to Supabase in Cell 3.5.
const ORDERS = [
  {
    ref: 'MYC-2026-024',
    date: '21 Apr 2026',
    items: "Lion's Mane ×4, Oyster ×10",
    fmt: 'Fresh fruiting body',
    tot: '£166.05',
    pill: 's-dis',
    status: 'Dispatched',
    track: true,
  },
  {
    ref: 'MYC-2026-023',
    date: '14 Apr 2026',
    items: 'Reishi powder ×2',
    fmt: 'Dried powder',
    tot: '£39.60',
    pill: 's-dis',
    status: 'Dispatched',
    track: true,
  },
  {
    ref: 'MYC-2026-022',
    date: '07 Apr 2026',
    items: 'Cordyceps ×1, Turkey Tail ×3',
    fmt: 'Dried powder',
    tot: '£61.20',
    pill: 's-con',
    status: 'Confirmed',
    track: false,
  },
  {
    ref: 'MYC-2026-021',
    date: '31 Mar 2026',
    items: "Lion's Mane ×6",
    fmt: 'Grain spawn',
    tot: '£99.90',
    pill: 's-dis',
    status: 'Dispatched',
    track: true,
  },
  {
    ref: 'MYC-2026-020',
    date: '24 Mar 2026',
    items: 'Oyster ×20',
    fmt: 'Substrate block',
    tot: '£171.00',
    pill: 's-dis',
    status: 'Dispatched',
    track: true,
  },
];

export default function OrdersPage() {
  return (
    <>
      <PageHeader
        label="Account"
        title="Order"
        italicSuffix="history"
        description="Agreement pricing applied. Net-30 terms active on your account."
        stat={{ value: 24, label: 'Orders this year' }}
      />

      <div className="tbl-wrap">
        <table className="data-tbl">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Placed</th>
              <th>Items</th>
              <th>Format</th>
              <th>Total</th>
              <th>Status</th>
              <th>Track</th>
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((o) => (
              <tr key={o.ref}>
                <td className="mono">{o.ref}</td>
                <td>{o.date}</td>
                <td>{o.items}</td>
                <td>{o.fmt}</td>
                <td style={{ fontWeight: 400, color: 'var(--ink)' }}>
                  {o.tot}
                </td>
                <td>
                  <span className={`s-pill ${o.pill}`}>{o.status}</span>
                </td>
                <td>{o.track ? <span className="tlink">Track →</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
