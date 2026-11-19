"use client";

import { adminFetch } from './admin-api';

/**
 * Opens a shop's portal as its owner, in a new tab (a one-hour support session; see AdminService.impersonate). The token rides in the URL
 * fragment to the shop's own host, which never sends a fragment to a server or into a Referer. The host is the shop's real address from the
 * API, so a shop on its own domain and one on the platform subdomain both work.
 */
export async function viewAsShop(shopId: string, storefrontUrl: string): Promise<string | null> {
  const res = await adminFetch(`/admin/shops/${shopId}/impersonate`, { method: 'POST' });
  const data = await res.json().catch(() => null);
  if (!res.ok) return data?.message || 'Could not view as this shop';
  window.open(`${storefrontUrl}/portal/sso#token=${encodeURIComponent(data.access_token)}`, '_blank', 'noopener');
  return null;
}
