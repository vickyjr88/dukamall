import { shopFetch } from '@/app/lib/api';

/**
 * Serves a product feed (product-feed.xml/.csv and the TikTok variants) on
 * the shop's own domain by forwarding to the backend's feed controller
 * (backend/src/product-feed). nginx sends every path on a shop's domain to
 * this Next app, so without a route here /product-feed.xml was a plain 404
 * even though the API serves it fine.
 *
 * Goes through shopFetch rather than a next.config.js rewrite because the
 * backend needs the x-shop-id header middleware.ts resolves from the Host --
 * shopFetch attaches it from the incoming request, the same as every other
 * server-side storefront call, and works for custom domains too.
 */
export async function proxyFeed(path: string): Promise<Response> {
  const upstream = await shopFetch(path);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream' },
  });
}
