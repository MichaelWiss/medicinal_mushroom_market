'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import {
  updatePost,
  publishPost,
  unpublishPost,
  deletePost,
} from '@/app/actions/dispatches';
import { slugify } from '@/lib/slugify';

const CATEGORIES = ['Harvest report', 'Compliance', 'Supply update', 'Announcement', 'Update'];

type Post = {
  id: string;
  slug: string;
  title: string;
  category: string;
  body: string;
  published_at: string | null;
};

export function EditPostForm({ post }: { post: Post }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slugManual, setSlugManual] = useState(true); // existing slug = manual
  const [slug, setSlug] = useState(post.slug);

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugManual) setSlug(slugify(e.target.value));
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugManual(true);
    setSlug(e.target.value);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updatePost(post.id, fd);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const result = await publishPost(post.id);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  function handleUnpublish() {
    setError(null);
    startTransition(async () => {
      const result = await unpublishPost(post.id);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm('Delete this post permanently?')) return;
    startTransition(async () => {
      const result = await deletePost(post.id);
      if (!result.ok) { setError(result.error); return; }
      router.push('/console/dispatches' as Route);
    });
  }

  return (
    <section className="px-11 py-10 max-w-2xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-serif text-[28px] font-light italic text-ink">
          Edit dispatch
        </h1>
        <span className={`s-pill ${post.published_at ? 's-dis' : 's-pen'}`}>
          {post.published_at ? 'Published' : 'Draft'}
        </span>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        {/* Title */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-[.16em] text-ink3 font-normal">Title</span>
          <input
            name="title"
            required
            maxLength={200}
            defaultValue={post.title}
            onChange={handleTitleChange}
            className="border-b-[3px] border-dotted border-[var(--dot)] bg-transparent py-2 text-[15px] text-ink font-light outline-none focus:border-ink transition-colors"
          />
        </label>

        {/* Slug */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-[.16em] text-ink3 font-normal">Slug</span>
          <input
            name="slug"
            required
            maxLength={200}
            value={slug}
            onChange={handleSlugChange}
            pattern="[a-z0-9-]+"
            className="border-b-[3px] border-dotted border-[var(--dot)] bg-transparent py-2 text-[13px] text-ink2 font-mono outline-none focus:border-ink transition-colors"
          />
          <span className="text-[10px] text-ink3">URL: /dispatches/{slug}</span>
        </label>

        {/* Category */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-[.16em] text-ink3 font-normal">Category</span>
          <select
            name="category"
            defaultValue={post.category}
            className="border-b-[3px] border-dotted border-[var(--dot)] bg-transparent py-2 text-[13px] text-ink font-light outline-none focus:border-ink transition-colors"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        {/* Body */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-[.16em] text-ink3 font-normal">Body (Markdown)</span>
          <textarea
            name="body"
            required
            rows={16}
            defaultValue={post.body}
            className="border-[3px] border-dotted border-[var(--dot)] bg-transparent p-3 text-[13px] text-ink font-light outline-none focus:border-ink transition-colors resize-y font-mono"
          />
        </label>

        {error && <p className="text-[12px] text-[#8a3020]">{error}</p>}

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" disabled={isPending} className="fp on">
            {isPending ? 'Saving…' : 'Save'}
          </button>

          {post.published_at ? (
            <button
              type="button"
              disabled={isPending}
              onClick={handleUnpublish}
              className="fp"
            >
              Unpublish
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={handlePublish}
              className="fp"
              style={{ borderColor: '#4a7a36', color: '#4a7a36' }}
            >
              Publish
            </button>
          )}

          <button
            type="button"
            disabled={isPending}
            onClick={handleDelete}
            className="fp ml-auto"
            style={{ borderColor: '#8a3020', color: '#8a3020' }}
          >
            Delete
          </button>
        </div>
      </form>
    </section>
  );
}
