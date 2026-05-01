import type { MetadataRoute } from 'next';
import { createAnonClient } from '@/lib/supabase/anon';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://myceliumco.com';

export const revalidate = 3600; // regenerate hourly

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/dispatches`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/subscriptions`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/quotes`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  ];

  const { data: posts } = await createAnonClient()
    .from('posts')
    .select('slug, published_at')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .order('published_at', { ascending: false });

  const postRoutes: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${BASE_URL}/dispatches/${post.slug}`,
    lastModified: new Date(post.published_at!),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...postRoutes];
}
