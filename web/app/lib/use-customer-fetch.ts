"use client";

import { useShopFetch } from './shop-id-context';
import { useCustomerAuth } from './customer-auth';

/** useShopFetch() plus the logged-in customer's Authorization header, for "my account" routes (order history, favorites, checkout). Falls back to a plain shop-scoped fetch when no customer is logged in -- callers that work for guests too (checkout) can use this unconditionally. */
export function useCustomerFetch() {
  const shopFetch = useShopFetch();
  const { token } = useCustomerAuth();
  return (path: string, init: RequestInit = {}) => {
    return shopFetch(path, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
  };
}
