import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { PortalProductService } from '../../src/portal-product/portal-product.service';
import { PortalSectionsService } from '../../src/portal-sections/portal-sections.service';
import { StorefrontService } from '../../src/storefront/storefront.service';
import { cleanup, close, makeShop, prisma } from './helpers';

const sections = new PortalSectionsService(prisma);
const products = new PortalProductService(prisma);
const storefront = new StorefrontService(prisma);

afterAll(async () => {
  await cleanup();
  await close();
});

const phone = (over: any = {}) => ({
  name: 'Galaxy A15', brand: 'Samsung', specs: [{ label: 'Battery', value: '5000 mAh' }], imageUrls: [],
  variants: [
    { sku: 'A15-128-BLK-NEW', priceKes: 21000, stockOnHand: 4, attributes: { storage: '128GB', colour: 'Black', condition: 'New' } },
    { sku: 'A15-128-BLU-NEW', priceKes: 21000, stockOnHand: 2, attributes: { storage: '128GB', colour: 'Blue', condition: 'New' } },
    { sku: 'A15-256-BLK-REF', priceKes: 24000, stockOnHand: 1, attributes: { storage: '256GB', colour: 'Black', condition: 'Refurbished' } },
  ],
  ...over,
});

describe('a phone shop, against the real database', () => {
  it('switching Devices and accessories on gives the shop its categories and no other shop anything', async () => {
    const a = await makeShop();
    const b = await makeShop();
    const result = await sections.setEnabled(a.id, 'devices', true);
    expect(result.created).toEqual(expect.arrayContaining(['Phones', 'Tablets', 'Phone cases and covers', 'Chargers and cables']));

    const cats = await prisma.productCategory.findMany({ where: { shopId: a.id } });
    expect(cats.length).toBe(result.created.length);
    expect(cats.every((c) => c.section === 'devices')).toBe(true);
    expect((await prisma.shop.findUnique({ where: { id: a.id } }))!.sections).toEqual(['devices']);
    // The other shop is untouched.
    expect(await prisma.productCategory.count({ where: { shopId: b.id } })).toBe(0);
    expect((await prisma.shop.findUnique({ where: { id: b.id } }))!.sections).toEqual([]);

    // Switching on twice creates nothing new.
    expect((await sections.setEnabled(a.id, 'devices', true)).created).toEqual([]);
  });

  it('a phone is created with storage, colour and condition, and comes back the same through the storefront', async () => {
    const shop = await makeShop();
    await sections.setEnabled(shop.id, 'devices', true);
    const phones = (await prisma.productCategory.findFirst({ where: { shopId: shop.id, slug: 'phones' } }))!;
    const created = await products.create(shop.id, { ...phone(), categoryId: phones.id } as any);

    expect(created.specs).toEqual([{ label: 'Battery', value: '5000 mAh' }]);
    expect(created.variants.map((v) => v.name)).toEqual([
      'Galaxy A15 - 128GB / Black / New', 'Galaxy A15 - 128GB / Blue / New', 'Galaxy A15 - 256GB / Black / Refurbished',
    ]);
    expect(created.variants.every((v) => v.size === null)).toBe(true);
    expect(created.variants[2].attributes).toEqual({ storage: '256GB', colour: 'Black', condition: 'Refurbished' });

    const page = await storefront.getBySlug(shop.id, created.slug);
    expect(page.section).toBe('devices');
    expect(page.optionGroups).toEqual([
      { key: 'storage', label: 'Storage', values: ['128GB', '256GB'] },
      { key: 'colour', label: 'Colour', values: ['Black', 'Blue'] },
      { key: 'condition', label: 'Condition', values: ['New', 'Refurbished'] },
    ]);
    expect(page.variants).toHaveLength(3);
  });

  it('a phone without storage (an accessory) and a watch are plain products with nothing to choose', async () => {
    const shop = await makeShop();
    await sections.setEnabled(shop.id, 'devices', true);
    await sections.setEnabled(shop.id, 'watches', true);
    const cases = (await prisma.productCategory.findFirst({ where: { shopId: shop.id, slug: 'phone-cases-and-covers' } }))!;
    const strap = (await prisma.productCategory.findFirst({ where: { shopId: shop.id, slug: 'mens-watches' } }))!;

    const caseProduct = await products.create(shop.id, { name: 'Clear case', categoryId: cases.id, variants: [{ sku: 'CASE-1', priceKes: 500 }] } as any);
    const watch = await products.create(shop.id, { name: 'Chrono Gold', categoryId: strap.id, variants: [{ sku: 'W-1', priceKes: 4500 }] } as any);
    for (const p of [caseProduct, watch]) {
      expect(p.variants).toHaveLength(1);
      expect(p.variants[0].size).toBeNull();
      expect(p.variants[0].attributes).toEqual({});
    }
    expect((await storefront.getBySlug(shop.id, watch.slug)).optionGroups).toEqual([]);
  });

  it('shirts still need a size, and the old way of sending one (a plain size) keeps working', async () => {
    const shop = await makeShop();
    await sections.setEnabled(shop.id, 'clothes', true);
    const tees = (await prisma.productCategory.findFirst({ where: { shopId: shop.id, slug: 't-shirts' } }))!;
    await expect(products.create(shop.id, { name: 'Tee', categoryId: tees.id, variants: [{ sku: 'T-1', priceKes: 900 }] } as any)).rejects.toThrow(/Size is required/);
    // Nothing half-made was left behind by the refusal.
    expect(await prisma.product.count({ where: { shopId: shop.id } })).toBe(0);

    const tee = await products.create(shop.id, { name: 'Tee', categoryId: tees.id, variants: [{ sku: 'T-M', priceKes: 900, size: 'M' }, { sku: 'T-L', priceKes: 900, attributes: { size: 'L', colour: 'Red' } }] } as any);
    expect(tee.variants.map((v) => [v.size, v.attributes])).toEqual([['M', { size: 'M' }], ['L', { size: 'L', colour: 'Red' }]]);
  });

  it('editing a product\'s options keeps sold variants, renames derived names and leaves stock alone unless it was edited', async () => {
    const shop = await makeShop();
    await sections.setEnabled(shop.id, 'devices', true);
    const phones = (await prisma.productCategory.findFirst({ where: { shopId: shop.id, slug: 'phones' } }))!;
    const created = await products.create(shop.id, { ...phone(), categoryId: phones.id } as any);
    const [first, second, third] = created.variants;

    // A sale of the third variant lands while the form is open.
    await prisma.productVariant.update({ where: { id: third.id }, data: { stockOnHand: 0 } });

    const { product, deactivated } = await products.syncVariants(shop.id, created.id, [
      { id: first.id, sku: first.sku, priceKes: 22000, attributes: { storage: '128GB', colour: 'Black', condition: 'New' } },
      { id: third.id, sku: third.sku, priceKes: 24000, attributes: { storage: '256GB', colour: 'Black', condition: 'Refurbished' } },
      { sku: 'A15-512-BLK-NEW', priceKes: 30000, stockOnHand: 3, attributes: { storage: '512GB', colour: 'Black', condition: 'New' } },
    ] as any);
    expect(deactivated).toEqual([]);
    expect(product.variants.map((v) => v.sku)).toEqual([first.sku, third.sku, 'A15-512-BLK-NEW']);
    expect(Number(product.variants[0].priceKes)).toBe(22000);
    expect(product.variants[1].stockOnHand).toBe(0);
    expect(product.variants[2].name).toBe('Galaxy A15 - 512GB / Black / New');
    expect(await prisma.productVariant.findUnique({ where: { id: second.id } })).toBeNull();

    // Renaming the product follows the derived names.
    const renamed = await products.update(shop.id, created.id, { name: 'Galaxy A15 5G' } as any);
    expect(renamed.variants[0].name).toBe('Galaxy A15 5G - 128GB / Black / New');

    // Specifications can be changed on their own.
    const withSpecs = await products.update(shop.id, created.id, { specs: [{ label: 'Display', value: '6.5 inch' }] } as any);
    expect(withSpecs.specs).toEqual([{ label: 'Display', value: '6.5 inch' }]);
    await expect(products.update(shop.id, created.id, { specs: [{ label: 'Display', value: '' }] } as any)).rejects.toThrow(/both a name and a value/);
  });

  it('a shop that predates sections works exactly as before: sizes, no categories', async () => {
    const shop = await makeShop();
    const created = await products.create(shop.id, { name: 'Zeta Runner', variants: [{ sku: 'Z-40', priceKes: 5000, size: 'EUR 40' }] } as any);
    expect(created.variants[0]).toMatchObject({ size: 'EUR 40', name: 'Zeta Runner - EUR 40', attributes: {} });
    expect((await storefront.getBySlug(shop.id, created.slug)).optionGroups).toEqual([]);
    expect((await prisma.shop.findUnique({ where: { id: shop.id } }))!.sections).toEqual([]);
  });

  it('sign-up can pick what the shop sells, and its categories exist from the first minute', async () => {
    const onboarding = new OnboardingService(prisma);
    const slug = `it-${Math.random().toString(36).slice(2, 8)}`;
    const { shop, ownerUserId } = await onboarding.createShop({
      shopName: 'Phone Hub', slug, ownerEmail: `${slug}@test.dev`, ownerFirstName: 'A', ownerLastName: 'B', password: 'password123',
      sections: ['devices', 'nonsense'],
    } as any);
    try {
      const row = await prisma.shop.findUnique({ where: { id: shop.id } });
      expect(row!.sections).toEqual(['devices']);
      expect(await prisma.productCategory.count({ where: { shopId: shop.id, section: 'devices' } })).toBeGreaterThan(5);
    } finally {
      await prisma.shop.delete({ where: { id: shop.id } });
      await prisma.user.delete({ where: { id: ownerUserId } }).catch(() => undefined);
    }
  });
});
