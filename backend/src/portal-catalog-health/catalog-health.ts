/**
 * Catalog health: the problems a merchant (or the person setting up their shop) would
 * otherwise find by scrolling through every product -- a KES 10 price among KES 3,700 ones,
 * a size typed into the product name, two products sharing one photo, brands left blank.
 * A pure function over the shop's active products, so it can be tested without a database.
 */

export type HealthProduct = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string | null;
  imageUrls: string[];
  categoryId: string | null;
  variants: { sku: string; size: string | null; priceKes: number; stockOnHand: number }[];
};

export type HealthContext = { shopName: string; shopSlug: string; categoryCount: number };

export type HealthIssue = {
  code: string;
  /** "problem" is likely wrong or hurts sales; "tip" is worth a look. */
  severity: 'problem' | 'tip';
  title: string;
  hint: string;
  products: { id: string; name: string; detail?: string }[];
};

export type CatalogHealth = {
  checked: number;
  /** Products with none of the "problem" issues. */
  clean: number;
  issues: HealthIssue[];
};

// Anything under this is almost certainly a typo for a footwear/fashion/electronics price in KES.
const IMPLAUSIBLE_PRICE = 100;
const SHORT_DESCRIPTION = 120;

// "Boss Casuals Black - EUR 40", "Converse White - 42", "Kanly (UK 8)".
const SIZE_IN_NAME = /(\s[-–]\s*|\s*\()(?:EUR|UK|US)?\s?\d{1,2}(?:\.\d)?\)?$/i;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const money = (n: number) => `KES ${Math.round(n).toLocaleString('en-US')}`;

export function analyseCatalog(products: HealthProduct[], ctx: HealthContext): CatalogHealth {
  const issues: HealthIssue[] = [];
  const flaggedProblem = new Set<string>();

  function add(
    code: string,
    severity: HealthIssue['severity'],
    title: string,
    hint: string,
    hits: { product: HealthProduct; detail?: string }[],
  ) {
    if (hits.length === 0) return;
    issues.push({ code, severity, title, hint, products: hits.map(({ product, detail }) => ({ id: product.id, name: product.name, detail })) });
    if (severity === 'problem') hits.forEach(({ product }) => flaggedProblem.add(product.id));
  }

  add('no-image', 'problem', 'No photo', 'Shoppers rarely buy what they cannot see, and link previews are blank.',
    products.filter((p) => p.imageUrls.length === 0).map((product) => ({ product })));

  add('no-variants', 'problem', 'No size or price', 'The product cannot be ordered until it has at least one priced size.',
    products.filter((p) => p.variants.length === 0).map((product) => ({ product })));

  // A price far below its own sizes' typical price, or below any plausible price at all.
  const priceHits: { product: HealthProduct; detail: string }[] = [];
  for (const product of products) {
    const prices = product.variants.map((v) => v.priceKes);
    const typical = prices.length >= 3 ? median(prices) : null;
    const odd = product.variants.filter((v) => v.priceKes < IMPLAUSIBLE_PRICE || (typical !== null && typical >= 500 && v.priceKes < typical * 0.25));
    if (odd.length) {
      const first = odd[0];
      const label = first.size ? `${first.size} is ${money(first.priceKes)}` : `priced at ${money(first.priceKes)}`;
      priceHits.push({ product, detail: typical ? `${label}; the others are about ${money(typical)}` : label });
    }
  }
  add('price-outlier', 'problem', 'Price looks wrong', 'A typo (KES 10 instead of 3,700) sells the pair for nearly nothing. Check each one.', priceHits);

  add('size-in-name', 'problem', 'Size typed into the name', 'Put the size on the size option instead, so shoppers can pick it and the name stays clean.',
    products
      .filter((p) => SIZE_IN_NAME.test(p.name) && p.variants.every((v) => !v.size))
      .map((product) => ({ product, detail: `"${product.name.match(SIZE_IN_NAME)![0].trim()}" at the end of the name` })));

  // Sizes written two ways ("EUR 40" on most products, a bare "40" on a few).
  const bareSize = /^\d{1,2}(?:\.\d)?$/;
  const euroSize = /^EUR\s*\d{1,2}(?:\.\d)?$/i;
  const withBare = products.filter((p) => p.variants.some((v) => bareSize.test((v.size ?? '').trim())));
  const withEuro = products.filter((p) => p.variants.some((v) => euroSize.test((v.size ?? '').trim())));
  if (withBare.length > 0 && withEuro.length > 0) {
    const minorityIsBare = withBare.length <= withEuro.length;
    add('mixed-size-labels', 'tip', 'Sizes written two ways',
      'Some products say "EUR 40" and others just "40". Shoppers are shown them together, so use one style everywhere (the storefront filter already treats them as the same size).',
      (minorityIsBare ? withBare : withEuro).map((product) => ({
        product,
        detail: minorityIsBare ? 'sizes are plain numbers; most products say "EUR 40"' : 'sizes say "EUR 40"; most products use plain numbers',
      })));
  }

  // The same first photo on more than one product.
  const byImage = new Map<string, HealthProduct[]>();
  for (const product of products) {
    const first = product.imageUrls[0];
    if (first) byImage.set(first, [...(byImage.get(first) ?? []), product]);
  }
  const duplicateHits: { product: HealthProduct; detail: string }[] = [];
  byImage.forEach((group) => {
    if (group.length < 2) return;
    for (const product of group) {
      duplicateHits.push({ product, detail: `same photo as ${group.filter((g) => g !== product).map((g) => g.name).join(', ')}` });
    }
  });
  add('duplicate-image', 'problem', 'Same photo as another product', 'Shoppers cannot tell these apart. Give each its own photo.', duplicateHits);

  add('no-description', 'problem', 'No description', 'Descriptions help shoppers decide and give search engines something to show.',
    products.filter((p) => !(p.description ?? '').trim()).map((product) => ({ product })));

  add('short-description', 'tip', 'Very short description', `Under ${SHORT_DESCRIPTION} characters: a sentence on look, fit and care goes a long way.`,
    products
      .filter((p) => {
        const length = (p.description ?? '').trim().length;
        return length > 0 && length < SHORT_DESCRIPTION;
      })
      .map((product) => ({ product, detail: `${(product.description ?? '').trim().length} characters` })));

  const shopName = ctx.shopName.trim().toLowerCase();
  add('brand-is-shop-name', 'problem', 'Brand is the shop name', 'Probably a placeholder: the brand should be who made the product.',
    products.filter((p) => (p.brand ?? '').trim().toLowerCase() === shopName).map((product) => ({ product })));

  add('no-brand', 'tip', 'No brand', 'Brands feed the storefront filter and the product feeds for Google and TikTok.',
    products.filter((p) => !(p.brand ?? '').trim()).map((product) => ({ product })));

  if (ctx.categoryCount > 0) {
    add('no-category', 'tip', 'Not in a category', 'Products without a category are missing from the category pages shoppers browse.',
      products.filter((p) => !p.categoryId).map((product) => ({ product })));
  } else if (products.length > 0) {
    issues.push({
      code: 'no-categories', severity: 'tip', title: 'No categories yet',
      hint: 'Categories let shoppers browse (Sneakers, Casuals, ...) and give search engines pages to show. Add a few, then assign products.',
      products: [],
    });
  }

  add('slug-is-shop-slug', 'tip', 'Web address is the shop name', 'Probably left over from copying: give the product an address that describes it.',
    products.filter((p) => p.slug === ctx.shopSlug).map((product) => ({ product })));

  add('out-of-stock', 'tip', 'Nothing in stock', 'Shoppers see these as unavailable and search engines are told they are out of stock. If you make or source to order, say so in the description.',
    products
      .filter((p) => p.variants.length > 0 && p.variants.every((v) => v.stockOnHand <= 0))
      .map((product) => ({ product })));

  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'problem' ? -1 : 1));
  return { checked: products.length, clean: products.filter((p) => !flaggedProblem.has(p.id)).length, issues };
}
