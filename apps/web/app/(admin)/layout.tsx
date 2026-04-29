// Providers + Shell live in the root layout. Admin gate is wired in Cell 2.3.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
