import { headers } from 'next/headers';

/**
 * Server-side fetch helper that forwards x-shop-id, set by middleware.ts
 * from the incoming domain. Every server component that reads storefront
 * data goes through this rather than calling fetch() directly, so the
 * tenant-scoping header is never accidentally dropped.
 */
export async function shopFetch(path: string, init: RequestInit = {}) {
  const shopId = headers().get('x-shop-id');
  const apiBase = (process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3200').replace(/\/$/, '');

  return fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(shopId ? { 'x-shop-id': shopId } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
}

export type ShopTheme = {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  fontPairing: string;
  layoutPreset: string;
};

export type ShopVariant = {
  id: string;
  sku: string;
  name: string;
  size: string | null;
  priceKes: string;
  wasPriceKes: string | null;
  stockOnHand: number;
};

export type ShopProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  brand: string | null;
  imageUrls: string[];
  variants: ShopVariant[];
  category: { id: string; name: string; slug: string } | null;
  /** Only present on the single-product response (getProduct), never on a
   * list response -- "you might also like" doesn't make sense for a related
   * product itself, so the backend doesn't recurse into its own relateds. */
  related?: ShopProduct[];
};

/** Headers that pin a request to a specific shop, for callers that resolved one themselves (see resolveShopIdForHost) because middleware didn't. */
function forShop(shopId?: string): RequestInit {
  return shopId ? { headers: { 'x-shop-id': shopId } } : {};
}

/**
 * The shop a Host header belongs to, or null. middleware.ts does this for
 * every storefront request, but skips /portal and /admin -- so a 404 under
 * those paths on a shop's own domain has no x-shop-id and uses this to find
 * the shop it should still send the visitor back to.
 */
export async function resolveShopIdForHost(host: string): Promise<string | null> {
  const apiBase = (process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3200').replace(/\/$/, '');
  try {
    const res = await fetch(`${apiBase}/resolve-shop/${encodeURIComponent(host)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()).id ?? null;
  } catch {
    return null;
  }
}

export async function getTheme(shopId?: string): Promise<ShopTheme> {
  const res = await shopFetch('/shop/theme', forShop(shopId));
  return res.json();
}

export type ProductListQuery = {
  category?: string;
  brand?: string;
  size?: string;
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
};

export async function getProducts(query: ProductListQuery = {}): Promise<ShopProduct[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  const res = await shopFetch(`/shop/products${qs ? `?${qs}` : ''}`);
  if (!res.ok) return [];
  return res.json();
}

export type ShopCategory = { id: string; name: string; slug: string };

export async function getCategories(shopId?: string): Promise<ShopCategory[]> {
  const res = await shopFetch('/shop/categories', forShop(shopId));
  if (!res.ok) return [];
  return res.json();
}

export type ShopFilters = { brands: string[]; sizes: string[] };

export async function getFilters(): Promise<ShopFilters> {
  const res = await shopFetch('/shop/filters');
  if (!res.ok) return { brands: [], sizes: [] };
  return res.json();
}

export async function getProduct(slug: string): Promise<ShopProduct | null> {
  const res = await shopFetch(`/shop/products/${slug}`);
  if (!res.ok) return null;
  return res.json();
}

export type ShopInfo = { name: string; whatsappNumber: string | null; currency: string };

export async function getShopInfo(shopId?: string): Promise<ShopInfo> {
  const res = await shopFetch('/shop/info', forShop(shopId));
  return res.json();
}
