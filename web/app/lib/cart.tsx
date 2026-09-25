"use client";

/**
 * The cart. Same shape as drip-crm's own lib/cart.tsx, including the
 * custom-size line support added there this session -- a line can carry a
 * customer-typed size with no matching variant, keyed by `id` rather than
 * `variantId` (null for a custom line), excluded from payableLines/checkout
 * but included in the WhatsApp order message.
 */

import {
  ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';

const STORAGE_KEY = 'shop_cart_v1';

export type CartLine = {
  id: string;
  variantId: string | null;
  productSlug: string;
  name: string;
  size: string;
  sku: string;
  priceKes: number;
  imageUrl?: string | null;
  quantity: number;
  isCustomSize?: boolean;
};

type CartValue = {
  lines: CartLine[];
  count: number;
  payableLines: CartLine[];
  hasCustomSizeLine: boolean;
  subtotal: number;
  add: (line: Omit<CartLine, 'id' | 'quantity'> & { id?: string }, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  ready: boolean;
};

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setLines(JSON.parse(saved));
    } catch {
      // A corrupt cart is not worth failing the page over.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private browsing can refuse writes; the cart still works in memory.
    }
  }, [lines, ready]);

  const add = useCallback((line: Omit<CartLine, 'id' | 'quantity'> & { id?: string }, quantity = 1) => {
    setLines((prev) => {
      const id = line.id ?? line.variantId ?? undefined;
      const existing = id ? prev.find((item) => item.id === id) : undefined;
      if (existing) {
        return prev.map((item) => (item.id === id ? { ...item, quantity: item.quantity + quantity } : item));
      }
      const newId = id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return [...prev, { ...line, id: newId, quantity }];
    });
  }, []);

  const setQuantity = useCallback((id: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0 ? prev.filter((item) => item.id !== id) : prev.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setLines((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const payableLines = useMemo(() => lines.filter((line) => !line.isCustomSize), [lines]);

  const value = useMemo<CartValue>(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    payableLines,
    hasCustomSizeLine: lines.some((line) => line.isCustomSize),
    subtotal: payableLines.reduce((sum, line) => sum + line.priceKes * line.quantity, 0),
    add,
    setQuantity,
    remove,
    clear,
    ready,
  }), [lines, payableLines, add, setQuantity, remove, clear, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
