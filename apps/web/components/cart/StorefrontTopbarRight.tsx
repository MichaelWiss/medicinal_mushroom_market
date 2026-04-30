'use client';

// Topbar slot for the storefront — chip + quote button + cart CTA. Reads cart
// count from the Zustand store; clicking Cart opens the drawer.

import { TopbarChip, TopbarButton, TopbarCta } from '@/components/shell/Topbar';
import { useCartStore, cartCount } from '@/lib/cart/store';
import { useToast } from '@/components/ui/ToastProvider';

export function StorefrontTopbarRight() {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const setOpen = useCartStore((s) => s.setOpen);
  const { toast } = useToast();
  // Gate the count until rehydration so SSR (0) matches the first
  // client render — otherwise React #418 hydration mismatch fires.
  const count = hydrated ? cartCount(items) : 0;

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
