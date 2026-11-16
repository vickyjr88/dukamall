"use client";

import { createContext, useContext } from 'react';

/** Which style the storefront is wearing, for components whose markup (not just colours) differs in the luxury styles. */
export type ShopStyle = { preset: string; luxe: boolean };

const StyleContext = createContext<ShopStyle>({ preset: 'classic', luxe: false });

export function StyleProvider({ preset, luxe, children }: ShopStyle & { children: React.ReactNode }) {
  return <StyleContext.Provider value={{ preset, luxe }}>{children}</StyleContext.Provider>;
}

export const useShopStyle = () => useContext(StyleContext);
