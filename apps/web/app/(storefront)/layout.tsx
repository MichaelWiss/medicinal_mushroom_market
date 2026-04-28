import { Shell } from '@/components/shell/Shell';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { CartProvider } from '@/components/cart/CartProvider';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { StorefrontTopbarRight } from '@/components/cart/StorefrontTopbarRight';

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <CartProvider>
        <Shell topbarRight={<StorefrontTopbarRight />}>{children}</Shell>
        <CartDrawer />
      </CartProvider>
    </ToastProvider>
  );
}
