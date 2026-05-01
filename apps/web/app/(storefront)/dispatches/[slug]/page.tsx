// Dispatch detail page.
// ISR: revalidate every 5 minutes.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Route } from 'next';
import { createAnonClient } from '@/lib/supabase/anon';
import { MarkdownBody } from '../MarkdownBody';

export const revalidate = 300;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

export default async function DispatchDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createAnonClient();

  const { data: post } = await supabase
    .from('posts')
    .select('slug, title, category, body, published_at')
    .eq('slug', slug)
    .single();

  if (!post) notFound();

  return (
    <div className="tbl-wrap max-w-3xl">
      {/* Back link */}
      <Link
        href={'/dispatches' as Route}
        className="fn-link inline-block mb-8"
      >
        &larr; &nbsp;All dispatches
      </Link>

      {/* Meta */}
      <div className="fn-meta mb-4">
        {fmtDate(post.published_at!)} <span>&#9632;</span> {post.category}
      </div>

      {/* Title */}
      <h1 className="font-serif text-[34px] font-light text-ink leading-[1.12] mb-10">
        {post.title}
      </h1>

      <hr className="divider-dot mb-10" />

      {/* Body */}
      <MarkdownBody body={post.body} />
    </div>
  );
}
