"use client";

/**
 * Shopper login state, mirroring the shape of lib/cart.tsx: localStorage-
 * backed, per-shop (a token from one shop's domain is meaningless on
 * another's, since CustomerJwtGuard on the backend checks the token's own
 * shopId against the request's resolved shop).
 *
 * The storage key is namespaced per shop id specifically so that switching
 * between two shops in the same browser (e.g. testing on
 * nairobigents.localhost and coastalthreads.localhost) never leaks one
 * shop's login into the other's -- a single shared key would let a stale
 * token from shop A be sent, and rejected, on shop B, or worse, silently
 * treated as "logged out" there when it's really just the wrong shop's
 * session.
 */

import {
  ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { useShopId } from './shop-id-context';

type Customer = { id: string; email: string };

type CustomerAuthValue = {
  customer: Customer | null;
  token: string | null;
  ready: boolean;
  login: (token: string, customer: Customer) => void;
  logout: () => void;
};

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

function storageKey(shopId: string | null) {
  return `shop_customer_${shopId ?? 'unknown'}`;
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const shopId = useShopId();
  const [state, setState] = useState<{ token: string; customer: Customer } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey(shopId));
      if (saved) setState(JSON.parse(saved));
    } catch {
      // A corrupt session is not worth failing the page over.
    }
    setReady(true);
  }, [shopId]);

  const login = useCallback((token: string, customer: Customer) => {
    setState({ token, customer });
    try {
      window.localStorage.setItem(storageKey(shopId), JSON.stringify({ token, customer }));
    } catch {
      // Private browsing can refuse writes; the session still works for this tab.
    }
  }, [shopId]);

  const logout = useCallback(() => {
    setState(null);
    try {
      window.localStorage.removeItem(storageKey(shopId));
    } catch {
      // See login() above.
    }
  }, [shopId]);

  const value = useMemo<CustomerAuthValue>(() => ({
    customer: state?.customer ?? null,
    token: state?.token ?? null,
    ready,
    login,
    logout,
  }), [state, ready, login, logout]);

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  return context;
}
