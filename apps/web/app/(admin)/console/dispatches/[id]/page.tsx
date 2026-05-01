// Edit / publish / delete post — admin console.
// Server component for data loading; client form for mutations.

import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { EditPostForm } from './EditPostForm';

export const dynamic = 'force-dynamic';

export default async function EditDispatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: post } = await supabase
    .from('posts')
    .select('id, slug, title, category, body, published_at')
    .eq('id', id)
    .single();

  if (!post) notFound();

  return <EditPostForm post={post} />;
}
