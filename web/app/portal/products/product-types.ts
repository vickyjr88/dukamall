// Shared by the new-product and edit-product screens (product-form.tsx and
// its size/image components).

export type Category = { id: string; name: string; slug: string; isActive: boolean; section?: string | null };

/** One kind of option a section's products come in (see backend src/common/sections.ts). */
export type SectionAxis = { key: string; label: string; required: boolean; presets: string[]; hint?: string };
/** A section as GET /portal/sections describes it. */
export type SectionInfo = {
  key: string; label: string; tagline: string; axes: SectionAxis[]; specs: string[]; enabled: boolean;
  categories: { name: string; slug: string; exists: boolean; inSection: boolean; products: number }[]; productCount: number;
};
export type Spec = { label: string; value: string };

export type ApiVariant = {
  id: string; sku: string; name: string; size: string | null; attributes?: Record<string, string> | null;
  priceKes: string; wasPriceKes: string | null; stockOnHand: number; isActive: boolean; position: number;
};

export type ApiProduct = {
  id: string; name: string; slug: string; description: string | null; seoTitle?: string | null; seoDescription?: string | null; brand: string | null;
  categoryId: string | null; imageUrls: string[]; isActive: boolean; isFeatured: boolean; specs?: Spec[] | null; costKes?: string | number | null;
  variants: ApiVariant[];
};

/**
 * One row of the size table. Strings for the numeric fields because they are
 * text inputs -- "" must stay distinguishable from 0 while someone is typing.
 */
export type SizeRow = {
  key: string;            // stable React key; never sent to the server
  id?: string;            // present for a variant that already exists
  size: string;           // for an options row this is its label ("128GB / Black / New"), worked out from `attributes`
  /** Present for a product whose category has options: what this variant is, e.g. { storage: "128GB" }. Absent for a plain size row. */
  attributes?: Record<string, string>;
  sku: string;
  skuTouched: boolean;    // false = still following the generated SKU
  priceKes: string;
  priceTouched: boolean;  // false = still following the "price for all sizes" box
  wasPriceKes: string;
  stockOnHand: string;
  stockTouched: boolean;  // existing variants only send stock when it was edited -- see PortalProductService.syncVariants
  isActive: boolean;
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/** "Zeta Runner Pro" + "EUR 40" -> "ZETA-RUNNER-PRO-EUR40". */
export function suggestSku(productName: string, size: string): string {
  const base = slugify(productName).toUpperCase().slice(0, 24).replace(/-+$/g, '');
  const token = size.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return [base, token].filter(Boolean).join('-');
}

let rowCounter = 0;
export function newRowKey(): string {
  rowCounter += 1;
  return `row-${Date.now()}-${rowCounter}`;
}

export const SIZE_PRESETS: { label: string; sizes: string[] }[] = [
  { label: 'Shoes EUR 36-46', sizes: range('EUR ', 36, 46) },
  { label: 'Clothing XS-XXL', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'Waist 28-40', sizes: range('', 28, 40, 2) },
  { label: 'One size', sizes: ['One size'] },
];

function range(prefix: string, from: number, to: number, step = 1): string[] {
  const out: string[] = [];
  for (let n = from; n <= to; n += step) out.push(`${prefix}${n}`);
  return out;
}

/**
 * Turns what someone types into the size labels it means, so a whole run of
 * sizes is one short entry rather than a dozen:
 *   "S, M, L"        -> S, M, L
 *   "EUR 36-46"      -> EUR 36 ... EUR 46
 *   "38-44"          -> 38 ... 44
 * Anything else is taken as a single label. Commas and new lines separate
 * entries (not spaces, since "One size" and "EUR 40" contain them).
 */
export function parseSizeEntry(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(/[,\n]/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(.*?)(\d+)\s*[-–]\s*(\d+)$/);
    if (m) {
      const [, prefix, a, b] = m;
      const from = Number(a); const to = Number(b);
      // A sanity cap: "1-5000" is a typo, not 5000 sizes.
      if (to >= from && to - from <= 60) { out.push(...range(prefix, from, to)); continue; }
    }
    out.push(part);
  }
  return out;
}

/** The options of a row in the order they are shown and named: size, storage, colour, condition... */
const AXIS_ORDER = ['size', 'storage', 'colour', 'condition', 'choice', 'option'];
export function orderedValues(attributes: Record<string, string> | undefined): string[] {
  return Object.entries(attributes ?? {})
    .filter(([, v]) => v && v.trim())
    .sort((a, b) => {
      const ra = AXIS_ORDER.indexOf(a[0]); const rb = AXIS_ORDER.indexOf(b[0]);
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    })
    .map(([, v]) => v.trim());
}

/** What a row is called: its options joined ("128GB / Black / New"), or "Standard" for a product that comes one way. */
export function optionLabel(attributes: Record<string, string> | undefined): string {
  const values = orderedValues(attributes);
  return values.length ? values.join(' / ') : 'Standard';
}

/** "Galaxy A15" + { storage: "128GB", colour: "Black" } -> "GALAXY-A15-128GB-BLACK". */
export function suggestOptionSku(productName: string, attributes: Record<string, string> | undefined): string {
  const base = slugify(productName).toUpperCase().slice(0, 24).replace(/-+$/g, '');
  const tokens = orderedValues(attributes).map((v) => v.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).filter(Boolean);
  return [base, ...tokens].filter(Boolean).join('-');
}

/** Every combination of the values entered for each option: [128GB, 256GB] x [Black, Blue] -> four. An empty option is skipped. */
export function combinations(axes: Array<{ key: string; values: string[] }>): Array<Record<string, string>> {
  const used = axes.filter((a) => a.values.length > 0);
  let out: Array<Record<string, string>> = [{}];
  for (const axis of used) out = out.flatMap((base) => axis.values.map((value) => ({ ...base, [axis.key]: value })));
  return out;
}

/** Comma or new-line separated entries, trimmed and de-duplicated ignoring case. */
export function splitValues(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(/[,\n]/).map((p) => p.trim()).filter(Boolean)) {
    if (!seen.has(part.toLowerCase())) { seen.add(part.toLowerCase()); out.push(part); }
  }
  return out;
}
