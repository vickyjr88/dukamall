"use client";

/** Admin (platform-operator) fetch helper -- mirrors portal/portal-api.ts, but with its own localStorage key so an admin session and a shop-staff session never collide if the same browser is used for both. */
export const ADMIN_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

export function adminAuthHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('shops_platform_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function adminFetch(path: string, init: RequestInit = {}) {
  return fetch(`${ADMIN_API_BASE}${path}`, {
    ...init,
    headers: { ...adminAuthHeaders(), ...(init.headers || {}) },
  });
}
