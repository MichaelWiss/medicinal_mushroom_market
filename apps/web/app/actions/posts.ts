'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOps } from '@/lib/auth/require-ops';

// ── Shared result type ────────────────────────────────────────
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };


// ── Input schemas ─────────────────────────────────────────────
const postSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  category: z.string().min(1, 'Category is required').max(80),
  body: z.string().min(1, 'Body is required'),
});

const publishSchema = z.object({
  id: z.string().uuid(),
});


// ── createPost ────────────────────────────────────────────────
export async function createPost(
  formData: FormData,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const guard = await requireOps();
  if (!guard.ok) return { ok: false, error: guard.error };

  const raw = {
    title: formData.get('title'),
    slug: formData.get('slug'),
    category: formData.get('category'),
    body: formData.get('body'),
  };

  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('posts')
    .insert(parsed.data)
    .select('id, slug')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A post with that slug already exists.' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/dispatches');
  revalidatePath('/console/dispatches');
  return { ok: true, data };
}

// ── updatePost ────────────────────────────────────────────────
export async function updatePost(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return { ok: false, error: guard.error };

  const raw = {
    title: formData.get('title'),
    slug: formData.get('slug'),
    category: formData.get('category'),
    body: formData.get('body'),
  };

  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('posts')
    .update(parsed.data)
    .eq('id', id);

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A post with that slug already exists.' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/dispatches');
  revalidatePath(`/dispatches/${parsed.data.slug}`);
  revalidatePath('/console/dispatches');
  revalidatePath(`/console/dispatches/${id}`);
  return { ok: true, data: undefined };
}

// ── publishPost ───────────────────────────────────────────────
export async function publishPost(id: string): Promise<ActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = publishSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, error: 'Invalid post ID.' };

  const supabase = createAdminClient();
  const { data: post, error: fetchErr } = await supabase
    .from('posts')
    .select('slug')
    .eq('id', id)
    .single();

  if (fetchErr || !post) return { ok: false, error: 'Post not found.' };

  const { error } = await supabase
    .from('posts')
    .update({ published_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dispatches');
  revalidatePath(`/dispatches/${post.slug}`);
  revalidatePath('/console/dispatches');
  return { ok: true, data: undefined };
}

// ── unpublishPost ─────────────────────────────────────────────
export async function unpublishPost(id: string): Promise<ActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = publishSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, error: 'Invalid post ID.' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('posts')
    .update({ published_at: null })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dispatches');
  revalidatePath('/console/dispatches');
  return { ok: true, data: undefined };
}

// ── deletePost ────────────────────────────────────────────────
export async function deletePost(id: string): Promise<ActionResult> {
  const guard = await requireOps();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = publishSchema.safeParse({ id });
  if (!parsed.success) return { ok: false, error: 'Invalid post ID.' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dispatches');
  revalidatePath('/console/dispatches');
  return { ok: true, data: undefined };
}
