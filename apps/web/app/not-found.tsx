import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-putty p-12 text-ink">
      <div className="max-w-md text-center">
        <p className="font-sans text-[11px] uppercase tracking-[0.4em] text-ink/55">
          404
        </p>
        <h1 className="mt-3 font-serif text-4xl font-light leading-tight">
          Page not <em className="italic">found</em>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink/70">
          The page you’re looking for hasn’t been planted yet. Head back to the
          catalogue to keep browsing.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block border border-ink/30 px-5 py-2 text-[11px] uppercase tracking-[0.3em] text-ink hover:bg-ink hover:text-putty"
        >
          Back to catalogue
        </Link>
      </div>
    </main>
  );
}
