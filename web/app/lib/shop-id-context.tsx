"use client";

/**
 * Makes the request-resolved shopId available to CLIENT components.
 *
 * middleware.ts resolves x-shop-id and forwards it to every server-side
 * fetch this app makes (see shopFetch() in lib/api.ts) -- but a client
 * component's own fetch() calls (checkout, cart-leads, customer-auth) never
 * pass through that middleware layer at all; they go straight from the
 * browser to the backend API's own origin. Without this, every one of those
 * calls silently lacks x-shop-id and the backend's ShopScopeGuard correctly
 * rejects them with 400 -- a real bug caught in browser testing: the "Buy
 * via WhatsApp" button's cart-lead POST failed exactly this way the first
 * time it was clicked for real.
 *
 * StorefrontLayout (a server component, which CAN read the incoming
 * request's headers) reads x-shop-id once and provides it here; every
 * client component that calls the API directly uses useShopFetch() below
 * instead of bare fetch(), so the header is never forgotten again.
 */

import { createContext, ReactNode, useContext } from 'react';

const ShopIdContext = createContext<string | null>(null);

export function ShopIdProvider({ shopId, children }: { shopId: string | null; children: ReactNode }) {
  return <ShopIdContext.Provider value={shopId}>{children}</ShopIdContext.Provider>;
}

export function useShopId() {
  return useContext(ShopIdContext);
}

/** fetch() that always carries x-shop-id when one is available. */
export function useShopFetch() {
  const shopId = useShopId();
  return (path: string, init: RequestInit = {}) => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3200';
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(shopId ? { 'x-shop-id': shopId } : {}),
        ...(init.headers || {}),
      },
    });
  };
}
