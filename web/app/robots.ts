import type { MetadataRoute } from 'next';
import { currentOrigin } from '@/app/lib/seo';

// One robots.ts serves every shop's own domain -- Next resolves the request
// through middleware.ts exactly like any storefront page, so this naturally
// varies per Host header without needing per-shop routing of its own.
// /portal and /admin are disallowed everywhere: neither has anything a
// search engine should index, and crawling them wastes a shop's own crawl
// budget on pages that always require a login anyway.
export default function robots(): MetadataRoute.Robots {
  const origin = currentOrigin();
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/portal', '/admin', '/account', '/cart', '/checkout'] },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
