// Admin gate is wired in Cell 2.3.
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Admin</p>
      </header>
      <main>{children}</main>
    </div>
  );
}
