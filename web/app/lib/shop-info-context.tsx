"use client";

/**
 * Makes the shop's public info (name, WhatsApp number, currency) available
 * to client components without prop-threading it through every page that
 * renders a ProductCard -- home grid, PDP's related-products rail, and the
 * favorites page all needed it for the card's WhatsApp quick-order button,
 * and re-fetching /shop/info in each one would be wasteful and could drift
 * if one call site forgot the fetch.
 *
 * Mirrors shop-id-context.tsx's exact provider/hook shape -- StorefrontLayout
 * already fetches ShopInfo for the header/footer, so this just also
 * provides it, rather than adding a second fetch.
 */

import { createContext, ReactNode, useContext } from 'react';
import { ShopInfo } from './api';

const ShopInfoContext = createContext<ShopInfo | null>(null);

export function ShopInfoProvider({ shopInfo, children }: { shopInfo: ShopInfo; children: ReactNode }) {
  return <ShopInfoContext.Provider value={shopInfo}>{children}</ShopInfoContext.Provider>;
}

export function useShopInfo() {
  return useContext(ShopInfoContext);
}
