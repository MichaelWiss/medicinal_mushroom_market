import { Shell } from '@/components/shell/Shell';

// Auth gate is wired in Cell 2.3 (middleware + Supabase server client).
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Shell>{children}</Shell>;
}
