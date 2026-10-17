/**
 * A shoe size is often written two ways in the same catalogue -- "EUR 40" and a bare "40" (one
 * product typed one way, the next another way). The storefront's size chips already hide the
 * "EUR " label, so the two looked like duplicate chips, and picking one found only the products
 * spelled that way. These helpers treat the spellings as one size for filtering.
 *
 * Only a number (optionally with a half) counts: "UK 8" or "XL" are different systems or labels
 * and are left exactly as written.
 */
const EUR_NUMBER = /^(?:EUR\s*)?(\d{1,2}(?:\.\d)?)$/i;

/** "EUR 40", "eur40" and "40" all become "40"; anything else is returned trimmed. */
export function canonicalSize(size: string): string {
  const trimmed = size.trim();
  const match = EUR_NUMBER.exec(trimmed);
  return match ? match[1] : trimmed;
}

/** Every way a size is spelled in the data, for matching a filter value against stored sizes. */
export function sizeSpellings(size: string): string[] {
  const canonical = canonicalSize(size);
  return EUR_NUMBER.test(canonical) ? [canonical, `EUR ${canonical}`, `EUR${canonical}`] : [size.trim()];
}

/** The distinct sizes of a shop, spellings merged, numbers in numeric order (36, 37 ... 46, then S, M ...). */
export function distinctSizes(raw: string[]): string[] {
  const seen = new Set<string>();
  for (const size of raw) {
    const canonical = canonicalSize(size);
    if (canonical) seen.add(canonical);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
