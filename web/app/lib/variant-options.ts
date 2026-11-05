import type { ShopVariant } from './api';

/** Same order the backend uses (common/variant-options.ts), so labels read the same everywhere. */
const ORDER = ['size', 'storage', 'colour', 'condition', 'choice', 'option'];

export function optionEntries(attributes: ShopVariant['attributes']): Array<[string, string]> {
  const entries = Object.entries(attributes ?? {}).filter(([, v]) => typeof v === 'string' && v.trim());
  const rank = (key: string) => { const i = ORDER.indexOf(key); return i === -1 ? ORDER.length : i; };
  return entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e[0]) - rank(b.e[0]) || a.i - b.i).map((x) => x.e);
}

/** What to call one variant to a shopper: "128GB / Black / New", or its size, or its name. Empty only for a one-of-a-kind product. */
export function variantLabel(v: Pick<ShopVariant, 'attributes' | 'size' | 'name'>): string {
  const values = optionEntries(v.attributes).map(([, value]) => value);
  if (values.length) return values.join(' / ');
  return v.size ?? v.name ?? '';
}

/** True when this variant's options do not include a size, so size wording should not appear for it. */
export function hasSize(v: Pick<ShopVariant, 'attributes' | 'size'>): boolean {
  const plain = !v.attributes || Object.keys(v.attributes).length === 0;
  return Boolean(v.attributes?.size) || (plain && Boolean(v.size));
}
