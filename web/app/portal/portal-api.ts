"use client";

/** Shared portal (staff) fetch helper -- attaches the logged-in staff member's token from localStorage. Was duplicated across products/theme/domain/settings pages; extracted here rather than copied a fifth time for orders. */
export const PORTAL_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

export function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('shops_platform_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function portalFetch(path: string, init: RequestInit = {}) {
  return fetch(`${PORTAL_API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
  });
}
