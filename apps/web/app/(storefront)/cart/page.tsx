// Cart route — server component shell (Cell 5.1).
//
// Loads Net-30 eligibility from Supabase server-side and forwards
// it to the client cart page so the "Pay on Net-30 invoice" CTA
// only renders for eligible companies. The server action +
// `net30_guard` trigger remain the actual security boundary.

import { CartPageClient } from './CartPageClient';
import { loadNet30Eligibility } from '@/lib/checkout/net30-eligibility';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const net30Enabled = await loadNet30Eligibility();
  return <CartPageClient net30Enabled={net30Enabled} />;
}
