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
};

export async function getTheme(): Promise<ShopTheme> {
  const res = await shopFetch('/shop/theme');
  return res.json();
}

export async function getProducts(): Promise<ShopProduct[]> {
  const res = await shopFetch('/shop/products');
  if (!res.ok) return [];
  return res.json();
}

export async function getProduct(slug: string): Promise<ShopProduct | null> {
  const res = await shopFetch(`/shop/products/${slug}`);
  if (!res.ok) return null;
  return res.json();
}
