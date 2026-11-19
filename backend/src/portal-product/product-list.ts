/**
 * The Products screen's list rules, kept free of the database so they can be tested: what a row summarises
 * (price range, stock, offer, photo), which filters exist, and how each sort orders.
 *
 * Sorting by price, stock or sales cannot be done by the database over a product's variants without raw SQL
 * repeated per filter, and a shop has hundreds of products, not millions, so the list loads the matching
 * products' light rows, ranks them here, and only then fetches the full rows of the one page shown.
 */

/** A product with this many or fewer left (across its shown sizes) is "running low". Same number as the dashboard. */
export const LOW_STOCK_THRESHOLD = 3;

export const PRODUCT_SORTS = [
  'newest', 'oldest', 'updated', 'name', 'name_desc', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc', 'sold', 'viewed',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const STOCK_FILTERS = ['in', 'low', 'out'] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

export const PRODUCT_FLAGS = ['no_photo', 'on_offer', 'featured', 'no_price'] as const;
export type ProductFlag = (typeof PRODUCT_FLAGS)[number];

export function parseSort(value: unknown): ProductSort {
  return (PRODUCT_SORTS as readonly string[]).includes(value as string) ? (value as ProductSort) : 'newest';
}
export function parseStockFilter(value: unknown): StockFilter | undefined {
  return (STOCK_FILTERS as readonly string[]).includes(value as string) ? (value as StockFilter) : undefined;
}
export function parseFlag(value: unknown): ProductFlag | undefined {
  return (PRODUCT_FLAGS as readonly string[]).includes(value as string) ? (value as ProductFlag) : undefined;
}

export type LightVariant = { priceKes: unknown; wasPriceKes: unknown; stockOnHand: number; isActive: boolean };
export type LightProduct = {
  id: string; slug: string; name: string; isFeatured: boolean; imageUrls: unknown; createdAt: Date; updatedAt: Date;
  variants: LightVariant[];
};

export type ProductSummary = {
  minPriceKes: number | null;
  maxPriceKes: number | null;
  /** Units in stock across the sizes a shopper can choose. */
  stock: number;
  /** In stock, running low, or sold out -- what a merchant scans a list for. */
  stockState: 'in' | 'low' | 'out';
  onOffer: boolean;
  hasPhoto: boolean;
};

function photoCount(imageUrls: unknown): number {
  return Array.isArray(imageUrls) ? imageUrls.filter((u) => typeof u === 'string' && u.trim()).length : 0;
}

/** What the shop shows: hidden sizes are left out, the same rule the old one-line summary used. */
export function summarise(p: Pick<LightProduct, 'imageUrls' | 'variants'>): ProductSummary {
  const shown = p.variants.filter((v) => v.isActive);
  const prices = shown.map((v) => Number(v.priceKes)).filter((n) => Number.isFinite(n));
  const stock = shown.reduce((sum, v) => sum + Math.max(0, v.stockOnHand), 0);
  return {
    minPriceKes: prices.length ? Math.min(...prices) : null,
    maxPriceKes: prices.length ? Math.max(...prices) : null,
    stock,
    stockState: stock <= 0 ? 'out' : stock <= LOW_STOCK_THRESHOLD ? 'low' : 'in',
    // An offer is a "was" price above the price now; a stale or equal "was" price is not one.
    onOffer: shown.some((v) => v.wasPriceKes != null && Number(v.wasPriceKes) > Number(v.priceKes)),
    hasPhoto: photoCount(p.imageUrls) > 0,
  };
}

export type RankInputs = { sold: Map<string, number>; views: Map<string, number> };

/** Keeps the products matching the stock filter and flag; both optional. */
export function filterProducts<T extends LightProduct>(products: T[], opts: { stock?: StockFilter; flag?: ProductFlag }): T[] {
  return products.filter((p) => {
    const s = summarise(p);
    if (opts.stock) {
      // "in" means plenty: a product running low is its own filter, so the two lists do not overlap.
      if (opts.stock === 'in' && s.stockState !== 'in') return false;
      if (opts.stock === 'low' && s.stockState !== 'low') return false;
      if (opts.stock === 'out' && s.stockState !== 'out') return false;
    }
    if (opts.flag === 'no_photo' && s.hasPhoto) return false;
    if (opts.flag === 'on_offer' && !s.onOffer) return false;
    if (opts.flag === 'featured' && !p.isFeatured) return false;
    if (opts.flag === 'no_price' && s.minPriceKes !== null && s.minPriceKes > 0) return false;
    return true;
  });
}

/** Ranks the products. Ties always fall back to newest first so the order is stable from page to page. */
export function sortProducts<T extends LightProduct>(products: T[], sort: ProductSort, rank: RankInputs): T[] {
  const newest = (a: T, b: T) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
  const by = (value: (p: T) => number, dir: 1 | -1) => (a: T, b: T) => (value(a) - value(b)) * dir || newest(a, b);
  // A product with no price sorts to the end whichever way the prices run, not to the top as "free".
  const price = (dir: 1 | -1) => (a: T, b: T) => {
    const pa = summarise(a).minPriceKes;
    const pb = summarise(b).minPriceKes;
    if (pa === null && pb === null) return newest(a, b);
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir || newest(a, b);
  };
  const name = (dir: 1 | -1) => (a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) * dir || newest(a, b);
  const list = [...products];
  switch (sort) {
    case 'oldest': return list.sort((a, b) => -newest(a, b));
    case 'updated': return list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || newest(a, b));
    case 'name': return list.sort(name(1));
    case 'name_desc': return list.sort(name(-1));
    case 'price_asc': return list.sort(price(1));
    case 'price_desc': return list.sort(price(-1));
    case 'stock_asc': return list.sort(by((p) => summarise(p).stock, 1));
    case 'stock_desc': return list.sort(by((p) => summarise(p).stock, -1));
    case 'sold': return list.sort(by((p) => rank.sold.get(p.id) ?? 0, -1));
    case 'viewed': return list.sort(by((p) => rank.views.get(p.slug) ?? 0, -1));
    default: return list.sort(newest);
  }
}

/** The pager's numbers, shared by every list: clamps a page past the end instead of returning an empty page. */
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const size = Math.min(100, Math.max(1, Math.floor(pageSize) || 25));
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pageSize: size, totalPages, total: items.length };
}
