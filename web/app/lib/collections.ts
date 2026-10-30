/**
 * Brand and model landing pages ("Nike sneakers in Nairobi", "Air Force 1 price in Kenya").
 *
 * People search by brand and model far more than by a shop's own category names, and the answer they want is a price
 * in shillings and a place to buy. These pages are built from the shop's live catalogue, so the price range, sizes
 * and stock counts in their copy are always the real ones and can never drift out of date; the only hand-written text
 * is a short factual line per model. Every shop gets them automatically, worded with its own name, address and hours.
 *
 * Pure functions over a product list, so the page, the sitemap and /llms.txt all agree on which pages exist.
 */
import type { ShopInfo, ShopProduct } from './api';

export type CollectionKind = 'brand' | 'collection';

export type Collection = {
  kind: CollectionKind;
  slug: string;
  /** "Nike" for a brand, "Nike Air Force 1" for a model. */
  name: string;
  /** What the products are, plural and lower case: "sneakers", "casuals". */
  noun: string;
  products: ShopProduct[];
  /** A short factual line about the model (models only). */
  blurb?: string;
};

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * No brand landing page for these names. Some products are described as "styled after" a luxury brand, and a page
 * titled "Dior sneakers in Nairobi" priced at a few thousand shillings would tell searchers they can buy the real thing
 * for that. "QC" is a quality-check label some suppliers put in the brand field, not a brand. The products stay on the
 * site under their own names; they just do not get a page that trades on the name.
 */
const NO_BRAND_PAGE = new Set([
  'rolex', 'hublot', 'patekphilippe', 'patek-philippe', 'seiko', 'omega', 'cartier', 'versace', 'dior', 'berluti',
  'gucci', 'prada', 'balenciaga', 'louis-vuitton', 'lv', 'fendi', 'burberry', 'chanel', 'hermes', 'off-white',
  'qc',
]);

/** A page is worth indexing once it has enough products to be a real collection rather than a thin page. */
export const MIN_BRAND_PRODUCTS = 3;
export const MIN_MODEL_PRODUCTS = 2;

type Series = { slug: string; name: string; match: RegExp; blurb: string };

// Matched against the product name. Only facts that are safe to state: the year a model first appeared.
const SERIES: Series[] = [
  { slug: 'air-force-1', name: 'Nike Air Force 1', match: /air\s?force\s?1\b|airforce\s?1\b|\baf1\b/i, blurb: 'The Air Force 1 first appeared in 1982 and has stayed a streetwear staple ever since, in everything from all-white to custom colourways.' },
  { slug: 'air-max', name: 'Nike Air Max', match: /air\s?max/i, blurb: 'Nike introduced visible Air cushioning in the Air Max line in 1987; the 90, 95 and 97 are among its best-known shapes.' },
  { slug: 'jordan-4', name: 'Air Jordan 4', match: /jordan\s?4\b/i, blurb: 'The Air Jordan 4 was first released in 1989 and is recognisable by its mesh side panels and lace wings.' },
  { slug: 'nike-dunk', name: 'Nike Dunk', match: /\bdunk/i, blurb: 'The Dunk started life as a basketball shoe in 1985 and became a skate and streetwear favourite.' },
  { slug: 'nike-tn', name: 'Nike Air Max TN (Tuned Air)', match: /\btn\b/i, blurb: 'The Air Max Plus, known as the TN for its Tuned Air units, arrived in 1998 with a wavy, layered upper.' },
  { slug: 'nike-shox', name: 'Nike Shox', match: /shox/i, blurb: 'Nike Shox put spring-like cushioning columns in the heel and launched in 2000.' },
  { slug: 'nocta-glide', name: 'Nike NOCTA Glide', match: /nocta/i, blurb: 'NOCTA is Nike\'s line with the artist Drake, launched in 2020; the Glide is its sculpted, futuristic runner.' },
  { slug: 'adidas-samba', name: 'Adidas Samba', match: /samba/i, blurb: 'The Samba dates back to 1949, built as a football shoe for icy pitches, and keeps its slim profile and gum sole.' },
  { slug: 'adidas-stan-smith', name: 'Adidas Stan Smith', match: /stan\s?smith/i, blurb: 'The Stan Smith is a minimalist tennis shoe, named after the player in 1971, with perforated stripes and a clean leather upper.' },
  { slug: 'adidas-campus', name: 'Adidas Campus', match: /campus/i, blurb: 'The Campus is a suede low-top from the 1970s with a retro basketball look.' },
];

/** The most common value, so one stray spelling does not rename a whole brand. */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

/** "sneakers", "casuals": the category most of these products sit in, lower case. */
function nounFor(products: ShopProduct[]): string {
  const names = products.map((p) => p.category?.name?.trim()).filter((n): n is string => Boolean(n));
  if (!names.length) return 'shoes';
  // A brand split fairly evenly across categories (8 casuals, 7 sneakers) is not "casuals"; say "shoes".
  const top = mostCommon(names);
  return names.filter((n) => n === top).length / products.length >= 0.7 ? top.toLowerCase() : 'shoes';
}

/** Every brand and model collection the catalogue supports (including ones too small to index). */
export function buildCollections(products: ShopProduct[]): Collection[] {
  const collections: Collection[] = [];

  const byBrand = new Map<string, ShopProduct[]>();
  for (const product of products) {
    const brand = product.brand?.trim();
    if (!brand) continue;
    const slug = slugify(brand);
    if (!slug || NO_BRAND_PAGE.has(slug)) continue;
    byBrand.set(slug, [...(byBrand.get(slug) ?? []), product]);
  }
  byBrand.forEach((list, slug) => {
    collections.push({ kind: 'brand', slug, name: mostCommon(list.map((p) => p.brand!.trim())), noun: nounFor(list), products: list });
  });

  for (const series of SERIES) {
    const list = products.filter((p) => series.match.test(p.name));
    if (list.length) collections.push({ kind: 'collection', slug: series.slug, name: series.name, noun: nounFor(list), products: list, blurb: series.blurb });
  }

  return collections;
}

export const isIndexable = (c: Collection) => c.products.length >= (c.kind === 'brand' ? MIN_BRAND_PRODUCTS : MIN_MODEL_PRODUCTS);

export const collectionPath = (c: Pick<Collection, 'kind' | 'slug'>) =>
  c.kind === 'brand' ? `/brand/${c.slug}` : `/collection/${c.slug}`;

/** The brand page for a product's brand name, if that brand has one worth sending a shopper to. */
export function brandPageFor(brand: string | null | undefined, all: Collection[]): Collection | undefined {
  const slug = brand ? slugify(brand) : '';
  return slug ? all.find((c) => c.kind === 'brand' && c.slug === slug && isIndexable(c)) : undefined;
}

const titleCase = (text: string) => text.replace(/(^|\s)(\S)/g, (_, space, ch) => space + ch.toUpperCase());

const price = (product: ShopProduct) => product.variants.map((v) => Number(v.priceKes)).filter((n) => n > 0);

const formatMoney = (shop: Pick<ShopInfo, 'currency'>, amount: number) => `${shop.currency} ${amount.toLocaleString('en-US')}`;

export type Facts = {
  count: number;
  minPrice: number | null;
  maxPrice: number | null;
  /** "EUR 36 to 46" style range, or null when the products carry no numeric sizes. */
  sizeRange: string | null;
  inStockStyles: number;
};

export function collectionFacts(c: Collection): Facts {
  const prices = c.products.flatMap(price);
  const sizes = Array.from(
    new Set(
      c.products
        .flatMap((p) => p.variants.map((v) => (v.size ?? '').replace(/^EUR\s*/i, '').trim()))
        .filter((s) => /^\d{2}(\.\d)?$/.test(s))
        .map(Number),
    ),
  ).sort((a, b) => a - b);
  return {
    count: c.products.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    sizeRange: sizes.length ? `EUR ${sizes[0]} to ${sizes[sizes.length - 1]}` : null,
    inStockStyles: c.products.filter((p) => p.variants.some((v) => v.stockOnHand > 0)).length,
  };
}

/** "Nairobi" when the shop's address says so; otherwise null and the copy just says Kenya. */
export function placeOf(shop: Pick<ShopInfo, 'address'>): string | null {
  const match = /\b(nairobi|mombasa|kisumu|nakuru|eldoret|thika)\b/i.exec(shop.address || '');
  return match ? titleCase(match[1].toLowerCase()) : null;
}

/** Page heading and search title: brands answer "X in Nairobi", models answer "X price in Kenya". */
export function collectionHeading(c: Collection, shop: Pick<ShopInfo, 'address'>): string {
  if (c.kind === 'collection') return `${c.name} Price in Kenya`;
  const place = placeOf(shop);
  return `${c.name} ${titleCase(c.noun)} in ${place ? `${place}, ` : ''}Kenya`;
}

const priceRange = (f: Facts, shop: Pick<ShopInfo, 'currency'>) =>
  f.minPrice === null ? null : f.maxPrice !== null && f.maxPrice > f.minPrice ? `${formatMoney(shop, f.minPrice)} to ${formatMoney(shop, f.maxPrice)}` : formatMoney(shop, f.minPrice);

const subjectOf = (c: Collection) => (c.kind === 'brand' ? `${c.name} ${c.noun}` : c.name);

/** Where the shop is, in one phrase: "at Shop F53, Dubai Merchants Mall, Nairobi CBD", or just its name. */
const whereIs = (shop: Pick<ShopInfo, 'name' | 'address'>) => (shop.address ? `${shop.name}, ${shop.address}` : shop.name);

export function collectionDescription(c: Collection, shop: ShopInfo): string {
  const f = collectionFacts(c);
  return [
    `${subjectOf(c)}: ${f.count} style${f.count === 1 ? '' : 's'}${f.minPrice !== null ? ` from ${formatMoney(shop, f.minPrice)}` : ''} at ${whereIs(shop)}.`,
    f.sizeRange ? `Sizes ${f.sizeRange}.` : '',
    'Order online or on WhatsApp.',
  ].filter(Boolean).join(' ');
}

/** The opening paragraph: the direct answer (price, where, how) before anything else. */
export function collectionIntro(c: Collection, shop: ShopInfo): string {
  const f = collectionFacts(c);
  const range = priceRange(f, shop);
  const place = placeOf(shop);
  return [
    `${shop.name} has ${c.kind === 'brand' ? `${f.count} style${f.count === 1 ? '' : 's'} of ${subjectOf(c)}` : `${f.count} ${c.name} style${f.count === 1 ? '' : 's'}`}${place ? ` in ${place}` : ''}${range ? `, priced at ${range}` : ''}.`,
    f.inStockStyles > 0
      ? `${f.inStockStyles} of ${f.count} ${f.count === 1 ? 'is' : 'are'} on the shelf in at least one size right now, and any other listed size can be ordered for you.`
      : 'Every listed size can be ordered for you.',
    shop.address ? `Visit us at ${shop.address}${shop.openingHours ? ` (${shop.openingHours})` : ''} or order online.` : 'Order online.',
  ].join(' ');
}

export type Faq = { question: string; answer: string };

/** Questions shoppers actually ask, answered from the live facts. Shown on the page and marked up as FAQPage. */
export function collectionFaqs(c: Collection, shop: ShopInfo): Faq[] {
  const f = collectionFacts(c);
  const range = priceRange(f, shop);
  const subject = subjectOf(c);
  const faqs: Faq[] = [];

  if (range) {
    faqs.push({
      question: `How much are ${subject} in Kenya?`,
      answer: `At ${shop.name}, ${subject} are priced from ${formatMoney(shop, f.minPrice!)}${f.maxPrice! > f.minPrice! ? ` up to ${formatMoney(shop, f.maxPrice!)}` : ''}, in Kenyan shillings, depending on the model. The prices on this page are live and change with the catalogue.`,
    });
  }
  if (shop.address) {
    faqs.push({
      question: `Where can I buy ${subject}${placeOf(shop) ? ` in ${placeOf(shop)}` : ''}?`,
      answer: `Visit ${shop.name} at ${shop.address}.${shop.openingHours ? ` We are open ${shop.openingHours}.` : ''} You can also order online.`,
    });
  }
  faqs.push({
    question: `Do you deliver ${subject}?`,
    answer: shop.deliveryFeeKes && shop.deliveryFeeKes > 0
      ? `Yes. Delivery costs ${formatMoney(shop, shop.deliveryFeeKes)}${shop.freeDeliveryOverKes ? ` and is free on orders over ${formatMoney(shop, shop.freeDeliveryOverKes)}` : ''}.`
      : 'Yes. Delivery is not charged at checkout because the cost depends on where the parcel is going: place your order and we will contact you to arrange delivery and confirm the cost.',
  });
  if (f.sizeRange) {
    faqs.push({
      question: `What sizes do your ${subject} come in?`,
      answer: `Across our ${subject} the sizes run ${f.sizeRange}, though the range varies by style. Each product page lists the sizes that pair actually comes in.${shop.whatsappNumber ? ' If your size is not listed, message us on WhatsApp and we will tell you honestly whether we can get it.' : ''}`,
    });
  }
  return faqs;
}
