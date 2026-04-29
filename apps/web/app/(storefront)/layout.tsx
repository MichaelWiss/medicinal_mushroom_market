// Providers + Shell live in the root layout so navigation between route
// groups keeps a single mounted shell (no provider remount = no flash, no
// cart loss). This file only declares the route group.
export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
