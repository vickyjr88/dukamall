import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminService } from '../../src/admin/admin.service';
import { PasswordResetService } from '../../src/password-reset/password-reset.service';
import { cleanup, close, makeShop, prisma } from './helpers';

const email = { send: jest.fn(async (..._args: any[]) => true) };
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const service = new AdminService(prisma, jwt, null as any, email as any, new PasswordResetService(prisma, email as any));
const rand = () => Math.random().toString(36).slice(2, 8);
const users: string[] = [];

async function user(over: Record<string, unknown> = {}) {
  const u = await prisma.user.create({ data: { email: `it-${rand()}@test.dev`, passwordHash: await bcrypt.hash('password123', 4), firstName: 'T', lastName: 'U', ...over } });
  users.push(u.id);
  return u;
}

beforeEach(() => email.send.mockClear());
afterAll(async () => {
  await cleanup();
  await prisma.passwordResetToken.deleteMany({ where: { accountId: { in: users } } });
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await close();
});

describe('support tool: change a staff role', () => {
  it('promotes and demotes, and logs each change', async () => {
    const shop = await makeShop(); const admin = await user({ isSuperAdmin: true });
    const owner = await user(); const cashier = await user();
    await prisma.userShop.createMany({ data: [{ userId: owner.id, shopId: shop.id, role: 'OWNER' }, { userId: cashier.id, shopId: shop.id, role: 'STAFF' }] });
    await service.changeStaffRole(shop.id, admin.id, cashier.id, 'OWNER');
    expect((await prisma.userShop.findUniqueOrThrow({ where: { userId_shopId: { userId: cashier.id, shopId: shop.id } } })).role).toBe('OWNER');
    await service.changeStaffRole(shop.id, admin.id, owner.id, 'STAFF'); // fine: cashier is now an owner too
    expect(await prisma.adminAuditLog.count({ where: { adminId: admin.id, shopId: shop.id, action: 'staff.role_changed' } })).toBe(2);
  });

  it("refuses to demote a shop's only owner", async () => {
    const shop = await makeShop(); const admin = await user({ isSuperAdmin: true }); const owner = await user();
    await prisma.userShop.create({ data: { userId: owner.id, shopId: shop.id, role: 'OWNER' } });
    await expect(service.changeStaffRole(shop.id, admin.id, owner.id, 'STAFF')).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.userShop.findUniqueOrThrow({ where: { userId_shopId: { userId: owner.id, shopId: shop.id } } })).role).toBe('OWNER');
  });

  it('will not change the role of someone who is not in that shop', async () => {
    const shopA = await makeShop(); const shopB = await makeShop(); const admin = await user({ isSuperAdmin: true }); const person = await user();
    await prisma.userShop.create({ data: { userId: person.id, shopId: shopB.id, role: 'STAFF' } });
    await expect(service.changeStaffRole(shopA.id, admin.id, person.id, 'OWNER')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('support tool: send a password reset', () => {
  it("emails a link to the person's own address only, and never returns it to the operator", async () => {
    const admin = await user({ isSuperAdmin: true }); const target = await user();
    const result: any = await service.sendPasswordReset(admin.id, target.id);
    expect(result.sent).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/token/i);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0]).toBe(target.email);
    expect(email.send.mock.calls[0][2]).toContain('reset-password?token=');
    expect(await prisma.passwordResetToken.count({ where: { accountId: target.id } })).toBe(1);
    expect(await prisma.adminAuditLog.count({ where: { adminId: admin.id, action: 'user.reset_sent' } })).toBe(1);
  });

  it('stops after 3 links in an hour, so it cannot flood someone\'s inbox', async () => {
    const admin = await user({ isSuperAdmin: true }); const target = await user();
    for (let i = 0; i < 3; i++) await service.sendPasswordReset(admin.id, target.id);
    await expect(service.sendPasswordReset(admin.id, target.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(email.send).toHaveBeenCalledTimes(3);
  });

  it('reports honestly when the email could not be sent', async () => {
    email.send.mockResolvedValueOnce(false);
    const admin = await user({ isSuperAdmin: true }); const target = await user();
    const result: any = await service.sendPasswordReset(admin.id, target.id);
    expect(result.sent).toBe(false);
    expect(result.message).toMatch(/could not be sent/);
  });

  it('404s for an unknown user', async () => {
    const admin = await user({ isSuperAdmin: true });
    await expect(service.sendPasswordReset(admin.id, 'nobody')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('support tool: edit shop details', () => {
  it('changes the allowed fields, clears blanks, logs which fields changed, and leaves the address alone', async () => {
    const shop = await makeShop({ whatsappNumber: '254700000000', notificationEmail: 'old@x.test' });
    const admin = await user({ isSuperAdmin: true });
    const updated: any = await service.updateShopDetails(shop.id, admin.id, { name: '  New Name ', whatsappNumber: '', notificationEmail: null, orderPrefix: 'NEW' });
    expect(updated).toMatchObject({ name: 'New Name', whatsappNumber: null, notificationEmail: null, orderPrefix: 'NEW', slug: shop.slug });
    const log = await prisma.adminAuditLog.findFirst({ where: { shopId: shop.id, action: 'shop.details_updated' } });
    expect((log!.metadata as any).fields.sort()).toEqual(['name', 'notificationEmail', 'orderPrefix', 'whatsappNumber']);
  });

  it('does not log a change when nothing actually changed', async () => {
    const shop = await makeShop();
    const admin = await user({ isSuperAdmin: true });
    await service.updateShopDetails(shop.id, admin.id, { name: shop.name, currency: shop.currency });
    expect(await prisma.adminAuditLog.count({ where: { shopId: shop.id, action: 'shop.details_updated' } })).toBe(0);
  });

  it('404s for an unknown shop', async () => {
    const admin = await user({ isSuperAdmin: true });
    await expect(service.updateShopDetails('nope', admin.id, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('support tool: copy one shop\'s products into another', () => {
  async function sourceShop() {
    const shop = await makeShop();
    const shoes = await prisma.productCategory.create({ data: { shopId: shop.id, name: 'Shoes', slug: 'shoes' } });
    await prisma.productCategory.create({ data: { shopId: shop.id, name: 'Unused', slug: 'unused' } });
    const a = await prisma.product.create({
      data: { shopId: shop.id, categoryId: shoes.id, name: 'Air One', slug: 'air-one', description: 'Nice', brand: 'Nike', imageUrls: ['https://img.test/a.jpg'], isFeatured: true, seoTitle: 'Air One Kenya', syncSourceId: 'feed-123',
        variants: { create: [
          { sku: 'AIR-42', name: 'Air One - 42', size: '42', priceKes: 5000, wasPriceKes: 6000, stockOnHand: 7, position: 0 },
          { sku: 'AIR-43', name: 'Air One - 43', size: '43', priceKes: 5000, stockOnHand: 3, position: 1, isActive: false },
        ] } },
    });
    await prisma.product.create({ data: { shopId: shop.id, name: 'Hidden Item', slug: 'hidden', isActive: false, variants: { create: [{ sku: 'H-1', name: 'Hidden', priceKes: 100, stockOnHand: 1 }] } } });
    return { shop, shoes, a };
  }

  it('previews without writing anything', async () => {
    const { shop } = await sourceShop(); const target = await makeShop(); const admin = await user({ isSuperAdmin: true });
    const r = await service.copyProducts(target.id, admin.id, { sourceShopId: shop.id, copyStock: false, dryRun: true });
    expect(r).toMatchObject({ dryRun: true, sourceProducts: 2, productsToCopy: 2, variantsToCopy: 3, productsSkippedAlreadyThere: 0, categoriesToCreate: 1 });
    expect(await prisma.product.count({ where: { shopId: target.id } })).toBe(0);
    expect(await prisma.productCategory.count({ where: { shopId: target.id } })).toBe(0);
  });

  it('copies products, sizes, prices, photos, flags and used categories — with stock at 0 by default', async () => {
    const { shop } = await sourceShop(); const target = await makeShop(); const admin = await user({ isSuperAdmin: true });
    await service.copyProducts(target.id, admin.id, { sourceShopId: shop.id, copyStock: false, dryRun: false });

    const copied = await prisma.product.findUniqueOrThrow({ where: { shopId_slug: { shopId: target.id, slug: 'air-one' } }, include: { variants: { orderBy: { position: 'asc' } }, category: true } });
    expect(copied).toMatchObject({ name: 'Air One', brand: 'Nike', description: 'Nice', isFeatured: true, seoTitle: 'Air One Kenya', imageUrls: ['https://img.test/a.jpg'] });
    expect(copied.category).toMatchObject({ slug: 'shoes', shopId: target.id });
    expect(copied.syncSourceId).toBeNull();                       // never inherits the feed-sync marker
    expect(copied.variants.map((v) => [v.sku, Number(v.priceKes), v.wasPriceKes && Number(v.wasPriceKes), v.stockOnHand, v.isActive])).toEqual([
      ['AIR-42', 5000, 6000, 0, true],
      ['AIR-43', 5000, null, 0, false],
    ]);
    expect((await prisma.product.findUniqueOrThrow({ where: { shopId_slug: { shopId: target.id, slug: 'hidden' } } })).isActive).toBe(false);
    // Only categories in use come across.
    expect(await prisma.productCategory.count({ where: { shopId: target.id } })).toBe(1);
    // They are new rows in the target, not shared with the source.
    const sourceIds = new Set((await prisma.productVariant.findMany({ where: { product: { shopId: shop.id } }, select: { id: true } })).map((v) => v.id));
    expect(copied.variants.some((v) => sourceIds.has(v.id))).toBe(false);
    expect(await prisma.adminAuditLog.count({ where: { shopId: target.id, action: 'shop.products_copied' } })).toBe(1);
  });

  it('copies stock counts when asked', async () => {
    const { shop } = await sourceShop(); const target = await makeShop(); const admin = await user({ isSuperAdmin: true });
    await service.copyProducts(target.id, admin.id, { sourceShopId: shop.id, copyStock: true, dryRun: false });
    const stock = await prisma.productVariant.findMany({ where: { product: { shopId: target.id, slug: 'air-one' } }, orderBy: { position: 'asc' }, select: { stockOnHand: true } });
    expect(stock.map((v) => v.stockOnHand)).toEqual([7, 3]);
  });

  it('is safe to run again: skips what is already there and never overwrites or deletes', async () => {
    const { shop } = await sourceShop(); const target = await makeShop(); const admin = await user({ isSuperAdmin: true });
    await service.copyProducts(target.id, admin.id, { sourceShopId: shop.id, copyStock: false, dryRun: false });
    // The target's owner edits a copied product and adds one of their own.
    await prisma.product.update({ where: { shopId_slug: { shopId: target.id, slug: 'air-one' } }, data: { name: 'Edited In Target' } });
    await prisma.product.create({ data: { shopId: target.id, name: 'Only Here', slug: 'only-here' } });
    // The source gains a product.
    await prisma.product.create({ data: { shopId: shop.id, name: 'New Arrival', slug: 'new-arrival', variants: { create: [{ sku: 'N-1', name: 'New', priceKes: 10 }] } } });

    const r = await service.copyProducts(target.id, admin.id, { sourceShopId: shop.id, copyStock: false, dryRun: false });
    expect(r).toMatchObject({ productsToCopy: 1, productsSkippedAlreadyThere: 2 });
    expect((await prisma.product.findUniqueOrThrow({ where: { shopId_slug: { shopId: target.id, slug: 'air-one' } } })).name).toBe('Edited In Target');
    expect(await prisma.product.count({ where: { shopId: target.id } })).toBe(4); // air-one, hidden, only-here, new-arrival
    expect(await prisma.productVariant.count({ where: { product: { shopId: target.id, slug: 'air-one' } } })).toBe(2); // not doubled
  });

  it('reuses a category that already exists in the target instead of duplicating it', async () => {
    const { shop } = await sourceShop(); const target = await makeShop(); const admin = await user({ isSuperAdmin: true });
    const existing = await prisma.productCategory.create({ data: { shopId: target.id, name: 'Shoes (mine)', slug: 'shoes' } });
    await service.copyProducts(target.id, admin.id, { sourceShopId: shop.id, copyStock: false, dryRun: false });
    expect(await prisma.productCategory.count({ where: { shopId: target.id } })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { shopId_slug: { shopId: target.id, slug: 'air-one' } } })).categoryId).toBe(existing.id);
  });

  it('refuses to copy a shop into itself, or from/to a shop that does not exist', async () => {
    const { shop } = await sourceShop(); const admin = await user({ isSuperAdmin: true });
    await expect(service.copyProducts(shop.id, admin.id, { sourceShopId: shop.id, copyStock: false, dryRun: false })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.copyProducts(shop.id, admin.id, { sourceShopId: 'nope', copyStock: false, dryRun: false })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.copyProducts('nope', admin.id, { sourceShopId: shop.id, copyStock: false, dryRun: false })).rejects.toBeInstanceOf(NotFoundException);
  });
});
