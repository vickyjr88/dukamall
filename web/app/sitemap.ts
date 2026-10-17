import type { MetadataRoute } from 'next';
import { getCategories, getPages, getProducts } from '@/app/lib/api';
import { currentOrigin } from '@/app/lib/seo';

function dateOrUndefined(value?: string): Date | undefined {
  const date = value ? new Date(value) : undefined;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
}

// Per-shop, same as robots.ts -- resolved through middleware.ts by whatever
// Host header this request arrived on, not a fixed platform-wide list.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = currentOrigin();
  const [products, categories, pages] = await Promise.all([getProducts(), getCategories(), getPages()]);

  // The storefront lists every active category, but an empty one is a thin page nobody
  // should land on from a search result -- only categories with products are submitted.
  const usedCategories = new Set(products.map((p) => p.category?.slug).filter(Boolean));
  const latestProductChange = products
    .map((p) => dateOrUndefined(p.updatedAt))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return [
    { url: origin, lastModified: latestProductChange, changeFrequency: 'daily', priority: 1 },
    ...categories
      .filter((c) => usedCategories.has(c.slug))
      .map((c) => ({
        url: `${origin}/?category=${c.slug}`,
        lastModified: latestProductChange,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      })),
    ...pages.map((p) => ({
      url: `${origin}/pages/${p.slug}`,
      lastModified: dateOrUndefined(p.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
    ...products.map((p) => ({
      url: `${origin}/shop/${p.slug}`,
      lastModified: dateOrUndefined(p.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ];
}
