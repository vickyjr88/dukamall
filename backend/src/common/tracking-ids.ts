/**
 * Google tracking identifiers a shop owner pastes in. They end up inside the
 * storefront's HTML (a script URL, an inline script, a meta tag), so they are held
 * to the exact shape Google issues and anything else is refused -- a value like
 * `G-X'); alert(1);//` must never reach a page.
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

export const isGa4Id = (v: string) => GA4_ID_PATTERN.test(v);
export const isSearchConsoleCode = (v: string) => SEARCH_CONSOLE_PATTERN.test(v);
