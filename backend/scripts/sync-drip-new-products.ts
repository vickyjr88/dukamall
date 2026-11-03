/**
 * Brings shops up to date with products added on Drip Emporium (https://api.dripemporium.store), from the server's
 * command line. The same operation runs automatically when Drip reports a change (see src/drip-sync); use this for the
 * first catch-up, or as a safety net if a notification was ever missed.
 *
 *   npx ts-node scripts/sync-drip-new-products.ts                      # preview, for the shops in DRIP_SYNC_TARGET_SHOPS
 *   npx ts-node scripts/sync-drip-new-products.ts --shop nairobigents  # preview one shop
 *   npx ts-node scripts/sync-drip-new-products.ts --apply              # do it
 *
 * Additive only: it creates products the shop lacks and adds sizes to products it created earlier. It never edits,
 * re-prices, deactivates or deletes anything, and never touches hand-curated products. Safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import { DripSyncService, targetShopSlugs } from '../src/drip-sync/drip-sync.service';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };

async function main() {
  const prisma = new PrismaClient();
  const apply = process.argv.includes('--apply');
  const shops = arg('shop') ? [arg('shop')!] : targetShopSlugs();
  const service = new DripSyncService(prisma as any);
  const results = await service.syncAll(shops, !apply);
  console.log(JSON.stringify(results, null, 2));
  if (!apply) console.log('\nPreview only. Add --apply to write.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
