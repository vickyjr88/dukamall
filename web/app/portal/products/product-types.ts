// Shared by the new-product and edit-product screens (product-form.tsx and
// its size/image components).

export type Category = { id: string; name: string; slug: string; isActive: boolean };

export type ApiVariant = {
  id: string; sku: string; name: string; size: string | null;
  priceKes: string; wasPriceKes: string | null; stockOnHand: number; isActive: boolean; position: number;
};

export type ApiProduct = {
  id: string; name: string; slug: string; description: string | null; brand: string | null;
  categoryId: string | null; imageUrls: string[]; isActive: boolean; isFeatured: boolean;
  variants: ApiVariant[];
};

/**
 * One row of the size table. Strings for the numeric fields because they are
 * text inputs -- "" must stay distinguishable from 0 while someone is typing.
 */
export type SizeRow = {
  key: string;            // stable React key; never sent to the server
  id?: string;            // present for a variant that already exists
  size: string;
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
