/**
 * Syncs a shop's catalog from Drip Emporium's own public product feed
 * (https://dripemporium.store/product-feed.csv) into a shop on this
 * platform -- built for the msa.dripemporium.store test shop, but takes
 * any shop slug + feed URL so it isn't hardcoded to that one pairing.
 *
 * Usage:
 *   npx ts-node scripts/sync-drip-emporium-feed.ts <shopSlug> [feedUrl]
 *
 *   npx ts-node scripts/sync-drip-emporium-feed.ts msa
 *   npx ts-node scripts/sync-drip-emporium-feed.ts msa https://dripemporium.store/product-feed.csv
 *
 * Feed shape (drip-crm's web/app/lib/product-feed.ts): one CSV row per
 * VARIANT, columns id,title,description,link,image_link,availability,price,
 * condition,brand,mpn,item_group_id,product_type. Rows sharing
 * item_group_id are the same product's different sizes; id/mpn is the SKU.
 *
 * -----------------------------------------------------------------------
 * The one rule this whole script exists to enforce: NEVER touch a product
 * a shop owner added by hand through the portal.
 * -----------------------------------------------------------------------
 * A synced product is tagged with syncSourceId = the feed's item_group_id
 * (see Product.syncSourceId in schema.prisma). Every write this script
 * makes is scoped to rows that already carry a syncSourceId, or that it is
 * about to create with one -- it is structurally incapable of matching, and
 * therefore incapable of overwriting or deactivating, a manually-created
 * product (syncSourceId IS NULL). Manually-added products aren't just
 * "usually left alone" as a side effect of matching logic that happens not
 * to hit them; every query below filters explicitly on syncSourceId being
 * non-null, so this holds even if the feed data changes shape later.
 *
 * Idempotent and safe to run repeatedly (e.g. from cron): re-running with an
 * unchanged feed makes no writes; a changed price/stock/image updates the
 * existing row rather than duplicating it; a variant or product that
 * disappears from the feed is deactivated (isActive: false), never
 * hard-deleted, because Order/CartLead rows may already reference it and
 * a shopper's order history must not go dangling.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type FeedRow = {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  availability: string;
  price: string;
  condition: string;
  brand: string;
  mpn: string;
  item_group_id: string;
  product_type: string;
};

/** Minimal RFC 4180 CSV parser -- handles quoted fields with embedded commas/newlines, which the feed's description column needs. No external dependency for one well-defined, already-known input shape. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

function rowsToObjects(rows: string[][]): FeedRow[] {
  const [header, ...body] = rows;
  return body.map((cells) => {
    const obj: Record<string, string> = {};
    header.forEach((key, i) => { obj[key] = cells[i] ?? ''; });
    return obj as FeedRow;
  });
}

/** "3500.00 KES" -> 3500.00. Feed's price is always "<amount> <CURRENCY>" (see product-feed.ts). */
function parsePrice(raw: string): number {
  const match = raw.match(/^([\d.]+)/);
  if (!match) throw new Error(`Unparseable price: "${raw}"`);
  return Number(match[1]);
}

/** "Jordan 4 Black Red - EUR 44" + item title without size -> "EUR 44". Falls back to the full title if there's no " - " separator (a sizeless product, e.g. a watch). */
function extractSize(title: string, productName: string): string | null {
  const prefix = `${productName} - `;
  return title.startsWith(prefix) ? title.slice(prefix.length) : null;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Resolves a slug that's guaranteed unique for this shop, for THIS
 * item_group_id specifically. Two different feed products can slugify to
 * the same string (same name, or names that only differ in punctuation) --
 * rare but real, and a plain create() would 500 the whole sync run on a
 * unique-constraint violation the moment it happens. Deterministic: the
 * same colliding group_id always gets the same suffixed slug on every run,
 * rather than a random one that would create a new row each time.
 */
async function resolveUniqueSlug(shopId: string, baseSlug: string, groupId: string, excludeProductId?: string): Promise<string> {
  const conflict = await prisma.product.findUnique({ where: { shopId_slug: { shopId, slug: baseSlug } } });
  if (!conflict || conflict.id === excludeProductId) return baseSlug;
  // Short, stable suffix derived from the group id -- not a counter, so it
  // doesn't shift on a re-run if an unrelated product is added/removed
  // in between.
  const suffix = groupId.replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase();
  return `${baseSlug}-${suffix}`;
}

async function main() {
  const shopSlug = process.argv[2];
  const feedUrl = process.argv[3] || 'https://dripemporium.store/product-feed.csv';

  if (!shopSlug) {
    console.error('Usage: npx ts-node scripts/sync-drip-emporium-feed.ts <shopSlug> [feedUrl]');
    process.exit(1);
  }

  const shop = await prisma.shop.findUnique({ where: { slug: shopSlug } });
  if (!shop) {
    console.error(`No shop found with slug "${shopSlug}"`);
    process.exit(1);
  }

  console.log(`Fetching ${feedUrl} ...`);
  const response = await fetch(feedUrl);
  if (!response.ok) {
    console.error(`Feed fetch failed: HTTP ${response.status}`);
    process.exit(1);
  }
  const csvText = await response.text();
  const rows = rowsToObjects(parseCsv(csvText));
  console.log(`Parsed ${rows.length} variant rows from the feed.`);

  // Group variant rows into products by item_group_id.
  const byGroup = new Map<string, FeedRow[]>();
  for (const row of rows) {
    if (!row.item_group_id) continue; // Malformed row -- skip rather than crash the whole sync.
    const list = byGroup.get(row.item_group_id) ?? [];
    list.push(row);
    byGroup.set(row.item_group_id, list);
  }

  let productsCreated = 0;
  let productsUpdated = 0;
  let variantsWritten = 0;

  const seenGroupIds = new Set<string>();

  for (const [groupId, groupRows] of byGroup) {
    seenGroupIds.add(groupId);
    const first = groupRows[0];
    // Product-level name is the title with its size suffix stripped; falls
    // back to the raw title for a sizeless single-variant product.
    const productName = groupRows.length > 1
      ? first.title.replace(/ - [^-]+$/, '')
      : first.title;

    const existing = await prisma.product.findUnique({
      where: { shopId_syncSourceId: { shopId: shop.id, syncSourceId: groupId } },
    });

    const slug = await resolveUniqueSlug(shop.id, slugify(productName), groupId, existing?.id);

    const productData = {
      name: productName,
      slug,
      description: first.description || null,
      brand: first.brand || null,
      imageUrls: [first.image_link].filter(Boolean),
      isActive: true,
    };

    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data: productData })
      : await prisma.product.create({
          data: { ...productData, shopId: shop.id, syncSourceId: groupId },
        });

    if (existing) productsUpdated++; else productsCreated++;

    const seenSkus = new Set<string>();

    for (const row of groupRows) {
      const sku = row.mpn || row.id;
      if (!sku) continue;
      seenSkus.add(sku);

      await prisma.productVariant.upsert({
        where: { productId_sku: { productId: product.id, sku } },
        create: {
          productId: product.id,
          sku,
          name: row.title,
          size: extractSize(row.title, productName),
          priceKes: parsePrice(row.price),
          stockOnHand: row.availability === 'in stock' ? 1 : 0,
          isActive: true,
        },
        update: {
          name: row.title,
          priceKes: parsePrice(row.price),
          stockOnHand: row.availability === 'in stock' ? 1 : 0,
          isActive: true,
        },
      });
      variantsWritten++;
    }

    // A size that dropped out of this product's own feed rows (discontinued,
    // renamed SKU) while the product itself is still present -- deactivate
    // just that variant rather than the whole product. Scoped to this
    // product's own variants, which already belongs to this shop and this
    // sync's own syncSourceId, so this can't reach a manually-added variant
    // on some other product.
    await prisma.productVariant.updateMany({
      where: { productId: product.id, sku: { notIn: Array.from(seenSkus) }, isActive: true },
      data: { isActive: false },
    });
  }

  // Deactivate synced products/variants that disappeared from the feed --
  // never hard-deleted (see header comment), and this ONLY ever touches
  // rows with a non-null syncSourceId, so a manually-added product can never
  // be caught by this even if its own id happened to coincide with
  // something (it can't: syncSourceId is null there, and every filter below
  // requires it to be set).
  const syncedProducts = await prisma.product.findMany({
    where: { shopId: shop.id, syncSourceId: { not: null } },
    select: { id: true, syncSourceId: true },
  });
  const staleProductIds = syncedProducts
    .filter((p) => p.syncSourceId && !seenGroupIds.has(p.syncSourceId))
    .map((p) => p.id);

  let productsDeactivated = 0;
  if (staleProductIds.length > 0) {
    const result = await prisma.product.updateMany({
      where: { id: { in: staleProductIds } },
      data: { isActive: false },
    });
    productsDeactivated = result.count;
  }

  console.log('Sync complete:');
  console.log(`  Products created:     ${productsCreated}`);
  console.log(`  Products updated:     ${productsUpdated}`);
  console.log(`  Products deactivated: ${productsDeactivated} (no longer in feed)`);
  console.log(`  Variants written:     ${variantsWritten}`);
}

main()
  .catch((err) => {
    console.error('Sync failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
