// Providers + Shell live in the root layout. Auth gate will be wired via
// middleware (Cell 2.3) rather than a layout wrapper.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
