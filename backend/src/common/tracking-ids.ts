/**
 * Tracking identifiers a shop owner pastes in (Google, Meta, TikTok, X). They end up inside the
 * storefront's HTML (a script URL, an inline script, a meta tag), so they are held
 * to the exact shape Google issues and anything else is refused -- a value like
 * `G-X'); alert(1);//` must never reach a page. The ad pixel IDs below go into inline
 * scripts the same way, so they are held to the shape each platform issues too.
 */

/** GA4 Measurement IDs look like G-ABC123DEF4 (Google issues 10 characters; allow a little slack). */
export const GA4_ID_PATTERN = /^G-[A-Z0-9]{6,14}$/;

/** Search Console's HTML-tag token: URL-safe characters, around 43 long. */
export const SEARCH_CONSOLE_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;

/** Accepts what people paste: spaces, lower case. Returns the cleaned ID (not yet validated). */
export function cleanGa4Id(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Accepts either the bare code or the whole tag Search Console shows
 * (`<meta name="google-site-verification" content="CODE" />`), and returns just the code.
 */
export function cleanSearchConsoleCode(input: string): string {
  const trimmed = input.trim();
  const fromTag = /content\s*=\s*["']([^"']+)["']/i.exec(trimmed);
  return (fromTag ? fromTag[1] : trimmed).trim();
}

/** Meta (Facebook) Pixel IDs are plain numbers, 15-16 digits today. */
export const META_PIXEL_PATTERN = /^[0-9]{8,20}$/;

/** TikTok Pixel IDs are upper-case letters and digits, about 20 characters (e.g. C1A2B3D4E5F6G7H8I9J0). */
export const TIKTOK_PIXEL_PATTERN = /^[A-Z0-9]{10,30}$/;

/** X (Twitter) Pixel / website tag IDs are short lower-case codes such as o1abc. */
export const X_PIXEL_PATTERN = /^[a-z0-9]{4,12}$/;

export const cleanMetaPixelId = (input: string): string => input.trim();
export const cleanTikTokPixelId = (input: string): string => input.trim().toUpperCase();
export const cleanXPixelId = (input: string): string => input.trim().toLowerCase();

export const isGa4Id = (v: string) => GA4_ID_PATTERN.test(v);
export const isSearchConsoleCode = (v: string) => SEARCH_CONSOLE_PATTERN.test(v);
export const isMetaPixelId = (v: string) => META_PIXEL_PATTERN.test(v);
export const isTikTokPixelId = (v: string) => TIKTOK_PIXEL_PATTERN.test(v);
export const isXPixelId = (v: string) => X_PIXEL_PATTERN.test(v);
