/**
 * Copies one shop's catalogue into another, from the server's command line --
 * the same operation as "Copy products from another shop" in the admin console
 * (AdminService.copyProducts), for when you'd rather run it there.
 *
 *   npx ts-node scripts/copy-shop-products.ts --from msa --to nairobigents            # preview only
 *   npx ts-node scripts/copy-shop-products.ts --from msa --to nairobigents --apply    # do it
 *   ... add --stock to copy stock counts too (default: every size starts at 0)
 *
 * Shops are named by slug. Safe to re-run: products that already exist in the
 * target (same address) are skipped, and nothing is ever deleted or overwritten.
 */
import { PrismaClient } from '@prisma/client';
import { AdminService } from '../src/admin/admin.service';

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const fromSlug = arg('from'); const toSlug = arg('to');
  if (!fromSlug || !toSlug) { console.error('Usage: --from <source-slug> --to <target-slug> [--apply] [--stock]'); process.exit(1); }

  const prisma = new PrismaClient();
  const [from, to] = await Promise.all([
    prisma.shop.findUnique({ where: { slug: fromSlug } }),
    prisma.shop.findUnique({ where: { slug: toSlug } }),
  ]);
  if (!from) throw new Error(`No shop with slug "${fromSlug}"`);
  if (!to) throw new Error(`No shop with slug "${toSlug}"`);

  // The audit log needs an admin to attribute this to: the first platform admin.
  const admin = await prisma.user.findFirst({ where: { isSuperAdmin: true }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('There is no platform admin to record this under.');

  const service = new AdminService(prisma as any, null as any, null as any, null as any);
  const result = await service.copyProducts(to.id, admin.id, { sourceShopId: from.id, copyStock: flag('stock'), dryRun: !flag('apply') });
  console.log(JSON.stringify(result, null, 2));
  if (result.dryRun) console.log('\nPreview only. Add --apply to copy.');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
