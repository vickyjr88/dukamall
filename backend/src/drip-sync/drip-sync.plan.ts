/**
 * Decides what bringing a shop up to date with Drip Emporium's catalogue means, without touching the database, so the
 * rules below can be tested and the preview and the real run can never disagree.
 *
 * This is deliberately NOT a mirror. Shops on this platform (msa, nairobigents) are curated by hand: their own
 * descriptions, prices, stock and categories. So the only things this ever does are
 *
 *   1. create a Drip product the shop does not have at all, and
 *   2. add a size Drip has since added to a product this same process created earlier.
 *
 * It never edits, re-prices, re-describes, deactivates or deletes anything, and never touches a product that was
 * added or curated by hand (those carry no syncSourceId).
 */

/** The parts of Drip's public GET /shop/products row that matter here. */
export type DripVariant = {
  sku: string;
  name: string;
  size: string | null;
  priceKes: number;
  inStock: boolean;
};

export type DripProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrls: string[];
  category: { name: string; slug: string } | null;
  variants: DripVariant[];
};

/** What the target shop already holds, reduced to the keys the rules look at. */
export type ShopSnapshot = {
  /** Every variant SKU in the shop, whichever product it sits on. */
  skus: Set<string>;
  slugs: Set<string>;
  /** Products this sync created earlier, keyed by the Drip product id they came from. */
  owned: Map<string, { id: string; skus: Set<string> }>;
};

export type ImportPlan = {
  create: DripProduct[];
  addSizes: { productId: string; dripId: string; slug: string; variants: DripVariant[] }[];
  /** On Drip but not created here because something else already uses its address. Needs a human. */
  conflicts: { slug: string; reason: string }[];
  /** On Drip but not sellable yet (no photo or no sizes); picked up on a later run once they are. */
  incomplete: string[];
  /** Drip products the shop already has (by SKU, or created earlier by this sync) and needs nothing from. */
  alreadyThere: number;
};

export function planImport(drip: DripProduct[], shop: ShopSnapshot): ImportPlan {
  const plan: ImportPlan = { create: [], addSizes: [], conflicts: [], incomplete: [], alreadyThere: 0 };
  // Two Drip products could in principle share a slug; the first one wins this run and the second is reported.
  const claimedSlugs = new Set<string>();

  for (const product of drip) {
    const variants = product.variants.filter((v) => v.sku);
    if (!product.imageUrls?.length || variants.length === 0) {
      plan.incomplete.push(product.slug);
      continue;
    }

    const owned = shop.owned.get(product.id);
    if (owned) {
      const missing = variants.filter((v) => !owned.skus.has(v.sku) && !shop.skus.has(v.sku));
      if (missing.length) plan.addSizes.push({ productId: owned.id, dripId: product.id, slug: product.slug, variants: missing });
      else plan.alreadyThere++;
      continue;
    }

    // The shop already sells this shoe if any of its SKUs is on any product here, whatever that product is now called.
    if (variants.some((v) => shop.skus.has(v.sku))) {
      plan.alreadyThere++;
      continue;
    }

    if (shop.slugs.has(product.slug) || claimedSlugs.has(product.slug)) {
      plan.conflicts.push({ slug: product.slug, reason: 'a different product here already uses this address' });
      continue;
    }

    claimedSlugs.add(product.slug);
    plan.create.push({ ...product, variants });
  }

  return plan;
}

/**
 * Starting stock for a created size. Zero, like "Copy products from another shop": two storefronts selling the same
 * pairs would oversell if both showed Drip's counts, so the shop owner sets what this shop really holds.
 */
export const STARTING_STOCK = 0;
