// Admin: list all posts (published + draft).
// Uses service-role — bypasses RLS to show drafts too.

import Link from 'next/link';
import type { Route } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : null;

export default async function AdminDispatchesPage() {
  const supabase = createAdminClient();
  const { data: posts } = await supabase
    .from('posts')
    .select('id, slug, title, category, published_at, created_at')
    .order('created_at', { ascending: false });

  return (
    <section className="px-11 py-10">
      <div className="flex items-baseline justify-between mb-8">
        <h1 className="font-serif text-[28px] font-light italic text-ink">
          Dispatches
        </h1>
        <Link
          href={'/console/dispatches/new' as Route}
          className="fp"
        >
          + New post
        </Link>
      </div>

      {!posts?.length ? (
        <p className="text-[13px] text-ink3 font-serif italic">
          No posts yet. <Link href={'/console/dispatches/new' as Route} className="tlink">Create the first one →</Link>
        </p>
      ) : (
        <div className="tbl-wrap !px-0 !py-0">
          <table className="data-tbl">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Published</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td className="font-light text-ink">{post.title}</td>
                  <td>{post.category}</td>
                  <td>
                    <span className={`s-pill ${post.published_at ? 's-dis' : 's-pen'}`}>
                      {post.published_at ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td>{fmtDate(post.published_at) ?? '—'}</td>
                  <td>{fmtDate(post.created_at)}</td>
                  <td>
                    <Link
                      href={`/console/dispatches/${post.id}` as Route}
                      className="tlink"
                    >
                      Edit →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
