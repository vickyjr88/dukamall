/**
 * A shop has ONE primary custom domain, but visitors type both forms of it:
 * "nairobigents.com" and "www.nairobigents.com". These are the host names that
 * count as the same site, so the "other" form reaches the shop (and is then
 * redirected to the primary one) instead of a "no shop found" error, and so that
 * another shop can't claim the other form of a domain that is already taken.
 */
export function domainVariants(host: string): string[] {
  const h = host.trim().toLowerCase();
  const bare = h.replace(/^www\./, '');
  return Array.from(new Set([h, bare, `www.${bare}`]));
}
