import 'reflect-metadata';
import sharp from 'sharp';
import { NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../../src/auth/decorators/roles.decorator';
import { IntegrationsService } from '../../src/integrations/integrations.service';
import { PostableProductsService } from '../../src/social/postable-products.service';
import { SocialPostingService } from '../../src/social/social-posting.service';
import { StatusKitController } from '../../src/social/status-kit.controller';
import { StatusKitService } from '../../src/social/status-kit.service';
import { cleanup, close, makeShop, prisma } from './helpers';

// The picture is made from the product's photo, fetched by address; the real fetch (DNS, https) is not what is tested here.
jest.mock('../../src/social/photo-fetch', () => ({
  ...jest.requireActual('../../src/social/photo-fetch'),
  fetchPhoto: jest.fn(async () => require('sharp')({ create: { width: 600, height: 500, channels: 3, background: '#998877' } }).jpeg().toBuffer()),
}));

const products = new PostableProductsService(prisma);
const kit = new StatusKitService(prisma, products);
const engine = new SocialPostingService(prisma, new IntegrationsService(prisma), products);

afterAll(async () => { await cleanup(); await close(); });

let uid = 0;
async function addProduct(shopId: string, name: string, over: { stock?: number; price?: number; image?: string | null; size?: string } = {}) {
  uid += 1;
  const category = await prisma.productCategory.create({ data: { shopId, name: `Cat ${uid}`, slug: `cat-${uid}-${Math.random().toString(36).slice(2, 6)}`, section: 'footwear' } });
  return prisma.product.create({
    data: {
      shopId, name, slug: `p-${uid}-${Math.random().toString(36).slice(2, 6)}`, categoryId: category.id, imageUrls: over.image === null ? [] : [over.image ?? `https://cdn.shops.test/${uid}.jpg`],
      variants: { create: [{ sku: `S-${uid}`, name: `${name} 42`, size: over.size ?? '42', priceKes: over.price ?? 5000, stockOnHand: over.stock ?? 5, isActive: true, position: 0 }] },
    },
  });
}
async function shopWith(names: string[]) {
  const shop = await makeShop();
  const made = [];
  for (const name of names) made.push(await addProduct(shop.id, name));
  return { shop, made };
}
const dayKey = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

describe('the day’s kit', () => {
  it('is made once, and everyone who opens it sees the same pictures', async () => {
    const { shop } = await shopWith(['Alpha Runner', 'Bravo Court', 'Charlie Trail', 'Delta Slide']);
    const first = await kit.today(shop.id, 'owner@x.test');
    const second = await kit.today(shop.id);
    expect(first).toHaveLength(3);
    expect(second.map((i) => i.id)).toEqual(first.map((i) => i.id));
    expect(new Set(first.map((i) => i.productName)).size).toBe(3);
    expect(first.every((i) => i.status === 'READY' && i.available)).toBe(true);
    expect(first[0].caption).toContain('💬 Reply to this status to order');
    expect(first[0].caption).toContain('utm_source=whatsapp&utm_medium=social&utm_campaign=status');
  });

  it('two people opening it at the same moment make one kit, not two', async () => {
    const { shop } = await shopWith(['One', 'Two Pair', 'Three Pair', 'Four Pair']);
    const [a, b] = await Promise.all([kit.today(shop.id), kit.today(shop.id)]);
    expect(await prisma.socialPost.count({ where: { shopId: shop.id, channel: 'STATUS' } })).toBe(3);
    expect(a.map((i) => i.id).sort()).toEqual(b.map((i) => i.id).sort());
  });

  it('only offers what a shopper can buy: out of stock, no photo and inactive products are left out, and a small shop gets a smaller kit', async () => {
    const { shop } = await shopWith(['In Stock One']);
    await addProduct(shop.id, 'Sold Out', { stock: 0 });
    await addProduct(shop.id, 'No Photo', { image: null });
    const hidden = await addProduct(shop.id, 'Hidden Pair');
    await prisma.product.update({ where: { id: hidden.id }, data: { isActive: false } });
    const items = await kit.today(shop.id);
    expect(items.map((i) => i.productName)).toEqual(['In Stock One']);
  });

  it('a shop with nothing to show gets an empty kit, not an error', async () => {
    const shop = await makeShop();
    expect(await kit.today(shop.id)).toEqual([]);
  });

  it('keeps its own rotation: a product posted on the Facebook Page is still fine for Status, and the other way round', async () => {
    const { shop, made } = await shopWith(['Solo Sneaker']);
    await prisma.socialPost.create({ data: { shopId: shop.id, channel: 'FACEBOOK', slotKey: `${dayKey()}T09:00`, status: 'POSTED', productId: made[0].id, postedAt: new Date() } });
    expect((await kit.today(shop.id)).map((i) => i.productName)).toEqual(['Solo Sneaker']);
  });

  it('does not repeat a product that was marked posted lately, unless there is nothing else', async () => {
    const { shop, made } = await shopWith(['Posted Before', 'Fresh One', 'Fresh Two']);
    await prisma.socialPost.create({ data: { shopId: shop.id, channel: 'STATUS', slotKey: '2026-01-01#1', status: 'POSTED', productId: made[0].id, postedAt: new Date(Date.now() - 86_400_000) } });
    const names = (await kit.today(shop.id)).map((i) => i.productName);
    expect(names.sort()).toEqual(['Fresh One', 'Fresh Two']);
  });
});

describe('how many pictures a day', () => {
  it('is three by default, can be set from 1 to 8, only ever adds to a kit already made, and is clamped', async () => {
    const { shop } = await shopWith(['A One', 'B Two', 'C Three', 'D Four', 'E Five', 'F Six']);
    expect(await kit.size(shop.id)).toBe(3);
    expect(await kit.today(shop.id)).toHaveLength(3);
    await kit.setSize(shop.id, 5, 'owner@x.test');
    expect(await kit.today(shop.id)).toHaveLength(5);
    await kit.setSize(shop.id, 1, 'owner@x.test');
    expect(await kit.today(shop.id)).toHaveLength(5); // today's pictures are never taken away
    expect((await kit.setSize(shop.id, 99, 'o')).count).toBe(8);
    expect((await kit.setSize(shop.id, 0, 'o')).count).toBe(1);
  });
  it('saving it does not switch on any posting', async () => {
    const shop = await makeShop();
    await kit.setSize(shop.id, 4, 'owner@x.test');
    const row = await prisma.socialSetting.findUniqueOrThrow({ where: { shopId: shop.id } });
    expect([row.facebookEnabled, row.threadsEnabled]).toEqual([false, false]);
  });
  it('only the owner may change it; staff can use the kit', () => {
    expect(Reflect.getMetadata(ROLES_KEY, StatusKitController.prototype.settings)).toEqual(['OWNER']);
    expect(Reflect.getMetadata(ROLES_KEY, StatusKitController)).toBeUndefined();
    for (const method of ['today', 'image', 'swap', 'posted'] as const) expect(Reflect.getMetadata(ROLES_KEY, StatusKitController.prototype[method])).toBeUndefined();
  });
});

describe('swap and mark as posted', () => {
  it('swap gives the next product, never one already in the kit', async () => {
    const { shop } = await shopWith(['P One', 'P Two', 'P Three', 'P Four', 'P Five']);
    const before = await kit.today(shop.id);
    const after = await kit.swap(shop.id, before[1].id);
    expect(after).toHaveLength(3);
    expect(after[1].id).toBe(before[1].id);
    expect(after[1].productName).not.toBe(before[1].productName);
    expect(new Set(after.map((i) => i.productName)).size).toBe(3);
    expect(after[0].productName).toBe(before[0].productName);
  });
  it('swap with nothing else to offer leaves the kit as it was', async () => {
    const { shop } = await shopWith(['Only One', 'Only Two', 'Only Three']);
    const before = await kit.today(shop.id);
    expect((await kit.swap(shop.id, before[0].id)).map((i) => i.productName)).toEqual(before.map((i) => i.productName));
  });
  it('marking posted records who and when, is safe to repeat, and a posted one cannot be swapped away', async () => {
    const { shop } = await shopWith(['M One', 'M Two', 'M Three', 'M Four']);
    const before = await kit.today(shop.id);
    const done = await kit.markPosted(shop.id, before[0].id, 'staff@x.test');
    expect(done[0].status).toBe('POSTED');
    const row = await prisma.socialPost.findUniqueOrThrow({ where: { id: before[0].id } });
    expect([row.triggeredBy, row.postedAt !== null]).toEqual(['staff@x.test', true]);
    await kit.markPosted(shop.id, before[0].id, 'someone.else@x.test');
    expect((await prisma.socialPost.findUniqueOrThrow({ where: { id: before[0].id } })).triggeredBy).toBe('staff@x.test');
    expect((await kit.swap(shop.id, before[0].id))[0].productName).toBe(before[0].productName);
  });
});

describe('a product that sells out after the kit was made', () => {
  it('is flagged, keeps its text, and its picture is no longer made', async () => {
    const { shop, made } = await shopWith(['Going Fast', 'Staying', 'Also Staying']);
    const before = await kit.today(shop.id);
    const gone = before.find((i) => i.productName === 'Going Fast')!;
    await prisma.productVariant.updateMany({ where: { productId: made[0].id }, data: { stockOnHand: 0 } });
    const after = await kit.today(shop.id);
    const flagged = after.find((i) => i.id === gone.id)!;
    expect(flagged.available).toBe(false);
    expect(flagged.caption).toBe(gone.caption);
    await expect(kit.image(shop.id, gone.id)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('a price changed since the morning shows in the text and not the old one', async () => {
    const { shop, made } = await shopWith(['Repriced', 'Other One', 'Other Two']);
    await kit.today(shop.id);
    await prisma.productVariant.updateMany({ where: { productId: made[0].id }, data: { priceKes: 4200 } });
    const item = (await kit.today(shop.id)).find((i) => i.productName === 'Repriced')!;
    expect(item.caption).toContain('KES 4,200');
  });
});

describe('the picture', () => {
  it('is a 1080x1920 JPEG in the shop’s theme colours', async () => {
    const { shop } = await shopWith(['Pretty Pair', 'Other Pair', 'Third Pair']);
    await prisma.shopTheme.create({ data: { shopId: shop.id, primaryColor: '#a81f1f', accentColor: '#e8a317' } });
    const [item] = await kit.today(shop.id);
    const jpeg = await kit.image(shop.id, item.id);
    const meta = await sharp(jpeg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1080, 1920]);
    const [r, , b] = (await sharp(jpeg).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer()).toJSON().data;
    expect(r).toBeGreaterThan(b); // red-tinted, not the default blue
  });
});

describe('every shop’s kit is its own', () => {
  it('another shop’s items cannot be read, swapped, marked or drawn: they are simply not found', async () => {
    const a = await shopWith(['Shop A One', 'Shop A Two', 'Shop A Three']);
    const b = await shopWith(['Shop B One', 'Shop B Two', 'Shop B Three']);
    const [itemA] = await kit.today(a.shop.id);
    const kitB = await kit.today(b.shop.id);
    expect(kitB.every((i) => /^Shop B/.test(i.productName ?? ''))).toBe(true);
    await expect(kit.image(b.shop.id, itemA.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(kit.swap(b.shop.id, itemA.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(kit.markPosted(b.shop.id, itemA.id, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect((await prisma.socialPost.findUniqueOrThrow({ where: { id: itemA.id } })).status).toBe('READY');
  });
  it('the same day in two shops is two kits (the day key is unique per shop)', async () => {
    const a = await shopWith(['Twin A1', 'Twin A2', 'Twin A3']);
    const b = await shopWith(['Twin B1', 'Twin B2', 'Twin B3']);
    await kit.today(a.shop.id); await kit.today(b.shop.id);
    expect(await prisma.socialPost.count({ where: { shopId: { in: [a.shop.id, b.shop.id] }, channel: 'STATUS' } })).toBe(6);
  });
  it('one shop’s size setting does not change another’s', async () => {
    const a = await makeShop(); const b = await makeShop();
    await kit.setSize(a.id, 7, 'o');
    expect(await kit.size(b.id)).toBe(3);
  });
});

describe('Status pictures are not posts', () => {
  it('stay out of the Social posting list and cannot be "taken down"', async () => {
    const { shop } = await shopWith(['List One', 'List Two', 'List Three']);
    const [item] = await kit.today(shop.id);
    await kit.markPosted(shop.id, item.id, 'staff@x.test');
    await prisma.socialPost.create({ data: { shopId: shop.id, channel: 'FACEBOOK', slotKey: `${dayKey()}T09:00`, status: 'POSTED', productName: 'On the Page', externalId: 'x_1' } });
    const list = await engine.list(shop.id, {});
    expect(list.items.map((i) => i.channel)).toEqual(['FACEBOOK']);
    expect(list.total).toBe(1);
    expect(await engine.remove(shop.id, item.id)).toEqual({ removed: false, detail: 'That post is not live' });
  });
});
