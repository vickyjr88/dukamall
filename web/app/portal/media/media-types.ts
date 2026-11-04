import { portalFetch } from '../portal-api';

/** One image in a shop's media library, as the API returns it (see backend MediaService.view). */
export type MediaItem = {
  id: string;
  objectKey: string;
  url: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  /** When the picture last changed. A crop keeps the image's address, so this is what tells a browser to refetch. */
  updatedAt: string;
  /** True once the image has been cropped: the previous version exists and can be restored. */
  hasPreviousVersion: boolean;
};

export type MediaLibraryPage = { items: MediaItem[]; nextCursor: string | null; total: number };

export function formatBytes(bytes: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The identity of an image in a stored URL ("{shopId}/{uuid}.ext" for the shop's own files): the host a URL was written
 * with can differ, the key cannot. A picture hosted elsewhere has no key here, so the whole address stands in for it.
 */
export function objectKeyOf(url: string): string {
  const match = /\/media\/([^?#]+)/.exec(url || '');
  return match ? match[1] : url;
}

/**
 * The address to DISPLAY an image from. Cropping keeps an image's address, so a browser may still hold the old
 * picture; the version marker makes it fetch the new one. Never store this: what is saved in a product or the theme
 * is the plain `url`, which always serves the current picture.
 */
export function freshUrl(item: Pick<MediaItem, 'url' | 'updatedAt'>): string {
  const stamp = Date.parse(item.updatedAt);
  return Number.isFinite(stamp) ? `${item.url}?v=${stamp}` : item.url;
}

/** A JSON call to the API as the logged-in staff member; throws the server's message on failure. */
export async function mediaRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await portalFetch(path, {
    method: init.method ?? 'GET',
    ...(init.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } : {}),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message[0] : data?.message || 'Something went wrong. Please try again.');
  return data as T;
}
