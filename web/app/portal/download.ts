"use client";

import { portalFetch } from './portal-api';

/**
 * Downloads a file from an authenticated portal endpoint. A plain link can't
 * carry the login token, so this fetches it and hands the browser a blob.
 * Returns an error message, or null on success.
 */
export async function downloadFile(path: string, filename: string): Promise<string | null> {
  const res = await portalFetch(path);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return data?.message || 'The download failed.';
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return null;
}

export const today = () => new Date().toISOString().slice(0, 10);
