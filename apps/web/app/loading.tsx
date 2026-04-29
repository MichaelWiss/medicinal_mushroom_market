// Rendered inside the persistent Shell while a route segment streams in.
// Mirrors the demo's instant page swap by giving immediate visual feedback
// instead of holding the previous page on screen during the RSC fetch.
export default function Loading() {
  return (
    <div
      className="flex h-full min-h-[40vh] items-center justify-center px-9 py-12 font-serif text-[15px] italic text-ink3"
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}
