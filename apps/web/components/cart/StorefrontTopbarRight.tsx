'use client';

// Topbar slot for the storefront — chip + quote button + cart CTA. Reads cart
// count from CartProvider; clicking Cart opens the drawer.

import { TopbarChip, TopbarButton, TopbarCta } from '@/components/shell/Topbar';
import { useCart } from './CartProvider';
import { useToast } from '@/components/ui/ToastProvider';

export function StorefrontTopbarRight() {
  const { count, setOpen } = useCart();
  const { toast } = useToast();

  return (
    <>
      <TopbarChip>Next dispatch Mon 27 Apr</TopbarChip>
      <TopbarButton onClick={() => toast('Opening quote request…')}>
        Request quote
      </TopbarButton>
      <TopbarCta count={count} onClick={() => setOpen(true)}>
        Cart
      </TopbarCta>
    </>
  );
}
