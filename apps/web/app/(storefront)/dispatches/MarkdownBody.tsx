'use client';

// react-markdown v9 is ESM-only. Loading it via next/dynamic with ssr:false
// keeps it entirely out of the server webpack bundle, preventing the
// "__webpack_modules__[moduleId] is not a function" error in dev and prod.

import dynamic from 'next/dynamic';

const ReactMarkdown = dynamic(() => import('react-markdown'), {
  ssr: false,
  loading: () => null,
});

export function MarkdownBody({ body }: { body: string }) {
  return (
    <div className="prose prose-neutral max-w-none prose-headings:font-serif prose-headings:font-light prose-headings:text-ink prose-p:text-ink2 prose-p:font-light prose-a:text-yellow prose-a:no-underline hover:prose-a:underline">
      <ReactMarkdown>{body}</ReactMarkdown>
    </div>
  );
}
