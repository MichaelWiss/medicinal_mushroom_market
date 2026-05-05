'use client';

// New post form — admin console.
// Slug is auto-generated from title but remains editable.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPost } from '@/app/actions/posts';
import { slugify } from '@/lib/slugify';

const CATEGORIES = ['Harvest report', 'Compliance', 'Supply update', 'Announcement', 'Update'];

export default function NewDispatchPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [slugManual, setSlugManual] = useState(false);
  const [slug, setSlug] = useState('');

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!slugManual) setSlug(slugify(e.target.value));
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugManual(true);
    setSlug(e.target.value);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createPost(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/console/dispatches/${result.data.id}`);
    });
  }

  return (
    <section className="px-11 py-10 max-w-2xl">
      <h1 className="font-serif text-[28px] font-light italic text-ink mb-8">
        New dispatch
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Title */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-[.16em] text-ink3 font-normal">Title</span>
          <input
            name="title"
            required
            maxLength={200}
            onChange={handleTitleChange}
            className="border-b-[3px] border-dotted border-[var(--dot)] bg-transparent py-2 text-[15px] text-ink font-light outline-none focus:border-ink transition-colors"
            placeholder="E.g. Spring Lion's Mane yield exceeds forecast"
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
            placeholder="spring-lions-mane-yield"
          />
          <span className="text-[10px] text-ink3">URL: /dispatches/{slug || '…'}</span>
        </label>

        {/* Category */}
        <label className="flex flex-col gap-1.5">
          <span className="text-[9px] uppercase tracking-[.16em] text-ink3 font-normal">Category</span>
          <select
            name="category"
            defaultValue="Update"
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
            className="border-[3px] border-dotted border-[var(--dot)] bg-transparent p-3 text-[13px] text-ink font-light outline-none focus:border-ink transition-colors resize-y font-mono"
            placeholder="Write in Markdown. **Bold**, _italic_, ## Heading, etc."
          />
        </label>

        {error && (
          <p className="text-[12px] text-[#8a3020]">{error}</p>
        )}

        <div className="flex gap-4 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="fp on"
          >
            {isPending ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="fp"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
