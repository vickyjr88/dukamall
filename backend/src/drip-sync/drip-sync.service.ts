import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { planImport, STARTING_STOCK, type DripProduct, type ImportPlan, type ShopSnapshot } from './drip-sync.plan';

export type ShopSyncResult = {
  shop: string;
  dryRun: boolean;
  created: string[];
  sizesAdded: { slug: string; skus: string[] }[];
  conflicts: ImportPlan['conflicts'];
  incomplete: string[];
  alreadyThere: number;
  failed: { slug: string; error: string }[];
};

const dripApiUrl = () => (process.env.DRIP_API_URL || 'https://api.dripemporium.store').replace(/\/$/, '');

/** The shops that follow Drip Emporium, from DRIP_SYNC_TARGET_SHOPS (comma-separated slugs). */
export const targetShopSlugs = () =>
  (process.env.DRIP_SYNC_TARGET_SHOPS ?? 'nairobigents').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Brings shops up to date with products newly added on Drip Emporium. See drip-sync.plan.ts for the rules: it only
 * ever adds, and never touches a product a shop owner added or curated.
 */
@Injectable()
export class DripSyncService {
  private readonly logger = new Logger(DripSyncService.name);
  private running = false;
  private rerun = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Drip's live public catalogue (not the CSV feed, which is cached for an hour and carries one photo only). */
  async fetchDripCatalogue(): Promise<DripProduct[]> {
    const response = await fetch(`${dripApiUrl()}/shop/products`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Drip catalogue fetch failed: HTTP ${response.status}`);
    const rows = (await response.json()) as any[];
    if (!Array.isArray(rows)) throw new Error('Drip catalogue came back in an unexpected shape');
    return rows.map((p) => ({
      id: String(p.id),
      slug: String(p.slug),
      name: String(p.name),
      brand: p.brand ?? null,
      description: p.description ?? null,
      imageUrls: Array.isArray(p.imageUrls) ? p.imageUrls.filter(Boolean) : [],
      category: p.category?.slug ? { name: String(p.category.name), slug: String(p.category.slug) } : null,
      variants: (p.variants ?? []).map((v: any) => ({
        sku: String(v.sku ?? ''),
        name: String(v.name ?? v.size ?? ''),
        size: v.size ?? null,
        priceKes: Number(v.priceKes),
        inStock: Boolean(v.inStock),
      })),
    }));
  }

  private async snapshot(shopId: string): Promise<ShopSnapshot> {
    const products = await this.prisma.product.findMany({
      where: { shopId },
      select: { id: true, slug: true, syncSourceId: true, variants: { select: { sku: true } } },
    });
    const snapshot: ShopSnapshot = { skus: new Set(), slugs: new Set(), owned: new Map() };
    for (const product of products) {
      snapshot.slugs.add(product.slug);
      const skus = new Set(product.variants.map((v) => v.sku));
      skus.forEach((sku) => snapshot.skus.add(sku));
      if (product.syncSourceId) snapshot.owned.set(product.syncSourceId, { id: product.id, skus });
    }
    return snapshot;
  }

  /** Finds the shop's category for a Drip category by address, creating it when the shop has none. */
  private async categoryId(shopId: string, category: DripProduct['category'], cache: Map<string, string>): Promise<string | null> {
    if (!category) return null;
    const cached = cache.get(category.slug);
    if (cached) return cached;
    const found = await this.prisma.productCategory.findUnique({ where: { shopId_slug: { shopId, slug: category.slug } } });
    const id = found?.id ?? (await this.prisma.productCategory.create({ data: { shopId, name: category.name, slug: category.slug } })).id;
    cache.set(category.slug, id);
    return id;
  }

  private variantRows(variants: DripProduct['variants'], firstPosition: number) {
    return variants.map((v, i) => ({
      sku: v.sku,
      name: v.name,
      size: v.size,
      priceKes: new Prisma.Decimal(v.priceKes),
      stockOnHand: STARTING_STOCK,
      isActive: true,
      position: firstPosition + i,
    }));
  }

  /** Brings one shop up to date. With `dryRun` it reports what would happen and writes nothing. */
  async syncShop(shopSlug: string, catalogue: DripProduct[], dryRun: boolean): Promise<ShopSyncResult> {
    const shop = await this.prisma.shop.findUnique({ where: { slug: shopSlug }, select: { id: true } });
    if (!shop) throw new Error(`No shop with slug "${shopSlug}"`);

    const plan = planImport(catalogue, await this.snapshot(shop.id));
    const result: ShopSyncResult = {
      shop: shopSlug,
      dryRun,
      created: [],
      sizesAdded: [],
      conflicts: plan.conflicts,
      incomplete: plan.incomplete,
      alreadyThere: plan.alreadyThere,
      failed: [],
    };

    if (dryRun) {
      result.created = plan.create.map((p) => p.slug);
      result.sizesAdded = plan.addSizes.map((a) => ({ slug: a.slug, skus: a.variants.map((v) => v.sku) }));
      return result;
    }

    const categories = new Map<string, string>();
    for (const product of plan.create) {
      try {
        await this.prisma.product.create({
          data: {
            shopId: shop.id,
            categoryId: await this.categoryId(shop.id, product.category, categories),
            name: product.name,
            slug: product.slug,
            description: product.description,
            brand: product.brand,
            imageUrls: product.imageUrls as Prisma.InputJsonValue,
            isActive: true,
            // Marks the row as created by this sync, so a later run can add sizes to it. Curated products have none.
            syncSourceId: product.id,
            variants: { create: this.variantRows(product.variants, 0) },
          },
        });
        result.created.push(product.slug);
      } catch (error) {
        // Two runs racing (the API runs as two slots during a deploy) trip the unique keys; the other run won.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        result.failed.push({ slug: product.slug, error: (error as Error).message });
      }
    }

    for (const add of plan.addSizes) {
      try {
        const position = await this.prisma.productVariant.count({ where: { productId: add.productId } });
        await this.prisma.productVariant.createMany({
          data: this.variantRows(add.variants, position).map((v) => ({ ...v, productId: add.productId })),
          skipDuplicates: true,
        });
        result.sizesAdded.push({ slug: add.slug, skus: add.variants.map((v) => v.sku) });
      } catch (error) {
        result.failed.push({ slug: add.slug, error: (error as Error).message });
      }
    }

    return result;
  }

  async syncAll(shopSlugs: string[], dryRun: boolean): Promise<ShopSyncResult[]> {
    const catalogue = await this.fetchDripCatalogue();
    const results: ShopSyncResult[] = [];
    for (const slug of shopSlugs) results.push(await this.syncShop(slug, catalogue, dryRun));
    return results;
  }

  /**
   * Called when Drip says its catalogue changed. Returns immediately; the sync runs in the background. A change that
   * arrives while a run is in flight queues exactly one more run, so a burst of edits costs two fetches, not fifty.
   */
  trigger(): void {
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = true;
    void this.runLoop();
  }

  private async runLoop() {
    try {
      do {
        this.rerun = false;
        try {
          const results = await this.syncAll(targetShopSlugs(), false);
          for (const r of results) {
            if (r.created.length || r.sizesAdded.length || r.failed.length) {
              this.logger.log(`${r.shop}: created ${r.created.join(', ') || 'none'}; sizes added to ${r.sizesAdded.map((s) => s.slug).join(', ') || 'none'}; failed ${r.failed.length}`);
            }
            for (const f of r.failed) this.logger.warn(`${r.shop}/${f.slug}: ${f.error}`);
            for (const c of r.conflicts) this.logger.warn(`${r.shop}/${c.slug}: not created, ${c.reason}`);
          }
        } catch (error) {
          this.logger.error(`Drip catalogue sync failed: ${(error as Error).message}`);
        }
      } while (this.rerun);
    } finally {
      this.running = false;
    }
  }
}
