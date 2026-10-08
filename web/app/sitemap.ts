import type { MetadataRoute } from 'next';
import { getCategories, getPages, getProducts } from '@/app/lib/api';
import { currentOrigin } from '@/app/lib/seo';

// Per-shop, same as robots.ts -- resolved through middleware.ts by whatever
// Host header this request arrived on, not a fixed platform-wide list.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = currentOrigin();
  const [products, categories, pages] = await Promise.all([getProducts(), getCategories(), getPages()]);

  return [
    { url: origin, changeFrequency: 'daily', priority: 1 },
    ...categories.map((c) => ({
      url: `${origin}/?category=${c.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
    ...pages.map((p) => ({
      url: `${origin}/pages/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
    ...products.map((p) => ({
      url: `${origin}/shop/${p.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
