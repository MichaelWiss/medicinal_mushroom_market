import type { Metadata } from 'next';
import { Cormorant_Garamond, Jost } from 'next/font/google';
import './globals.css';
import { Shell } from '@/components/shell/Shell';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { CartProvider } from '@/components/cart/CartProvider';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { createAnonClient } from '@/lib/supabase/anon';
import type { FooterDispatch } from '@/components/shell/Footer';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jost',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Mycelium — wholesale medicinal mushroom marketplace',
  description:
    'Inoculation-dated, contamination-checked, cold-chain certified spawn and extract for B2B buyers.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch latest 2 published posts for the footer "Latest dispatches" band.
  // Uses the anon client so it respects the public RLS policy.
  // Errors are silently swallowed — Footer falls back to static content.
  let footerDispatches: FooterDispatch[] | undefined;
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from('posts')
      .select('slug, title, category, published_at')
      .order('published_at', { ascending: false })
      .limit(2);
    if (data?.length) footerDispatches = data as FooterDispatch[];
  } catch {
    // silently fall back to static content
  }

  return (
    <html lang="en" className={`${cormorant.variable} ${jost.variable}`}>
      <body className="min-h-screen bg-putty text-ink font-sans font-light antialiased">
        <PostHogProvider>
          <ToastProvider>
            <CartProvider>
              <Shell {...(footerDispatches ? { footerDispatches } : {})}>{children}</Shell>
              <CartDrawer />
            </CartProvider>
          </ToastProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
