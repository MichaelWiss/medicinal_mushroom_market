import { Shell } from '@/components/shell/Shell';

// Admin gate is wired in Cell 2.3.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Shell>{children}</Shell>;
}
