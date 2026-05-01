// Dispatches list — public blog index.
// ISR: revalidate every 5 minutes; cache tags allow on-demand purge
// when a post is published via the admin console.

import Link from 'next/link';
import type { Route } from 'next';
import { createAnonClient } from '@/lib/supabase/anon';

export const revalidate = 300;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

export default async function DispatchesPage() {
  const supabase = createAnonClient();
  const { data: posts } = await supabase
    .from('posts')
    .select('slug, title, category, published_at')
    .order('published_at', { ascending: false });

  return (
    <div className="tbl-wrap max-w-3xl">
      <h1 className="font-serif text-[36px] font-light text-ink mb-2">
        Dispatches
      </h1>
      <p className="text-[13px] text-ink3 mb-10 font-light">
        Harvest reports, compliance updates, and supply chain news from Mycelium Supply Co.
      </p>

      {!posts?.length ? (
        <p className="text-[13px] text-ink3 italic font-serif">
          No dispatches published yet.
        </p>
      ) : (
        <div className="border-t-[3px] border-dotted border-[var(--dot)]">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/dispatches/${post.slug}` as Route}
              className="block border-b-[3px] border-dotted border-[var(--dot)] py-7 group"
            >
              <div className="fn-meta mb-3">
                {fmtDate(post.published_at!)} <span>&#9632;</span> {post.category}
              </div>
              <div className="fn-title group-hover:text-ink2 transition-colors">
                {post.title}
              </div>
              <span className="fn-link mt-3 inline-block">
                Read &nbsp;&rarr;
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
