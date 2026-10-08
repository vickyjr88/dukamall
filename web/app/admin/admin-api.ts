"use client";

/** Admin (platform-operator) fetch helper -- mirrors portal/portal-api.ts, but with its own localStorage key so an admin session and a shop-staff session never collide if the same browser is used for both. */
export const ADMIN_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

export function adminAuthHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('shops_platform_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * An admin session lasts 12 hours. When one expires (or the account's admin
 * access is revoked) every call comes back 401; send the operator to the login
 * page from here, once, rather than leaving each screen to notice and cope --
 * several (analytics, settings, the revenue chart) didn't, and showed a broken page.
 */
export async function adminFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    ...init,
    headers: { ...adminAuthHeaders(), ...(init.headers || {}) },
  });
  if (res.status === 401 && !window.location.pathname.startsWith('/admin/login')) {
    window.localStorage.removeItem('shops_platform_admin_token');
    window.location.replace('/admin/login');
  }
  // The platform requires two-factor sign-in and this admin hasn't set it up: the
  // API refuses everything except the setup routes, so go there.
  if (res.status === 403 && !window.location.pathname.startsWith('/admin/security')) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code === 'two_factor_required') window.location.replace('/admin/security');
  }
  return res;
}
