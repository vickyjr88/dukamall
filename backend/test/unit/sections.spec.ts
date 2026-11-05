import { BadRequestException } from '@nestjs/common';
import { SECTIONS, SECTION_KEYS, axisLabel, sectionByKey, slugOf } from '../../src/common/sections';
import { cleanAttributes, cleanSpecs, conditionOf, optionGroups, sizeFrom, variantLabel } from '../../src/common/variant-options';
import { cleanSectionKeys, ensureSectionCategories } from '../../src/common/shop-sections';
import { variantFields } from '../../src/portal-product/portal-product.service';
import { PortalSectionsService } from '../../src/portal-sections/portal-sections.service';
import { analyseCatalog } from '../../src/portal-catalog-health/catalog-health';

const devices = sectionByKey('devices')!;
const clothes = sectionByKey('clothes')!;
const watches = sectionByKey('watches')!;
const row = (over: any = {}) => ({ sku: 'SKU-1', priceKes: 1000, ...over });

describe('the section catalogue', () => {
  it('has the four sections the platform launches with, plus shoes', () => {
    expect(SECTION_KEYS).toEqual(expect.arrayContaining(['watches', 'clothes', 'electronics', 'devices', 'footwear']));
    expect(sectionByKey('devices')!.label).toBe('Devices and accessories');
  });

  it('is internally consistent: unique keys, valid option names, no duplicate categories, no required option without presets', () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTIONS.length);
    for (const section of SECTIONS) {
      expect(section.categories.length).toBeGreaterThan(2);
      expect(new Set(section.categories.map(slugOf)).size).toBe(section.categories.length);
      expect(section.specs.length).toBeGreaterThan(0);
      const keys = section.axes.map((a) => a.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const axis of section.axes) {
        expect(axis.key).toMatch(/^[a-z][a-z0-9]{0,19}$/);
        if (axis.required) expect(axis.presets.length).toBeGreaterThan(0);
      }
    }
  });

  it('sells watches without a size and phones without one required', () => {
    expect(watches.axes.some((a) => a.key === 'size')).toBe(false);
    expect(devices.axes.some((a) => a.required)).toBe(false);
    expect(clothes.axes.find((a) => a.key === 'size')!.required).toBe(true);
  });

  it('knows the labels of the options it defines', () => {
    expect(axisLabel('storage')).toBe('Storage');
    expect(axisLabel('size')).toBe('Size');
    expect(axisLabel('weirdkey')).toBe('Weirdkey');
  });
});

describe('cleanAttributes', () => {
  it('trims, drops blanks and keeps the rest', () => {
    expect(cleanAttributes({ storage: ' 128GB ', colour: '', condition: 'New' }, devices)).toEqual({ storage: '128GB', condition: 'New' });
    expect(cleanAttributes(undefined)).toEqual({});
  });
  it('refuses a missing required option, naming it', () => {
    expect(() => cleanAttributes({}, clothes)).toThrow(/Size is required for a garment/);
    expect(() => cleanAttributes({ colour: 'Red' }, clothes)).toThrow(BadRequestException);
    expect(cleanAttributes({ size: 'M' }, clothes)).toEqual({ size: 'M' });
  });
  it('refuses nonsense: odd names, long values, too many, not an object', () => {
    expect(() => cleanAttributes({ 'Bad Key': 'x' })).toThrow(/not a valid option name/);
    expect(() => cleanAttributes({ colour: 'x'.repeat(41) })).toThrow(/40 characters/);
    expect(() => cleanAttributes(Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`k${i}`, 'v'])))).toThrow(/up to 6/);
    expect(() => cleanAttributes(['a'])).toThrow(/names and values/);
    expect(() => cleanAttributes('x')).toThrow(/names and values/);
  });
});

describe('variants made of options', () => {
  it('a phone is named by its options in the usual order, whatever order they were sent', () => {
    const v = variantFields('Galaxy A15', row({ attributes: { condition: 'New', colour: 'Black', storage: '128GB' } }), devices);
    expect(v.name).toBe('Galaxy A15 - 128GB / Black / New');
    expect(v.size).toBeNull();
    expect(v.attributes).toEqual({ condition: 'New', colour: 'Black', storage: '128GB' });
  });
  it('a shirt entered the old way (a plain size) is the same as one entered with options', () => {
    const old = variantFields('Polo', row({ size: 'M' }), clothes);
    const fresh = variantFields('Polo', row({ attributes: { size: 'M' } }), clothes);
    expect(old).toEqual(fresh);
    expect(old.size).toBe('M');
    expect(old.attributes).toEqual({ size: 'M' });
  });
  it('a shirt with a size and a colour keeps the size in its own column too, so the size filter still finds it', () => {
    const v = variantFields('Polo', row({ attributes: { size: 'L', colour: 'Navy' } }), clothes);
    expect([v.size, v.name]).toEqual(['L', 'Polo - L / Navy']);
  });
  it('a watch has nothing to choose: one plain variant, or named choices if there really are some', () => {
    expect(variantFields('Chrono', row(), watches)).toEqual({ attributes: {}, size: null, name: 'Chrono' });
    expect(variantFields('Slim', row({ attributes: { choice: 'Brown strap' } }), watches).name).toBe('Slim - Brown strap');
  });
  it('a category from before sections behaves exactly as it always did', () => {
    const v = variantFields('Zeta Runner', row({ size: 'EUR 40' }));
    expect(v).toEqual({ attributes: {}, size: 'EUR 40', name: 'Zeta Runner - EUR 40' });
    expect(variantFields('Plain', row()).name).toBe('Plain');
  });
  it('a name the merchant typed is kept', () => {
    expect(variantFields('Phone', row({ name: 'My name', attributes: { storage: '64GB' } }), devices).name).toBe('My name');
  });
  it('refuses a variant that breaks the section\'s rules before anything is written', () => {
    expect(() => variantFields('Polo', row({ attributes: { colour: 'Red' } }), clothes)).toThrow(/Size is required/);
  });
  it('labels', () => {
    expect(variantLabel({ colour: 'Black', storage: '128GB' })).toBe('128GB / Black');
    expect(variantLabel({}, ' EUR 40 ')).toBe('EUR 40');
    expect(variantLabel(null)).toBe('');
    expect(sizeFrom({ size: 'S' }, 'M')).toBe('S');
    expect(sizeFrom({}, ' L ')).toBe('L');
    expect(sizeFrom({})).toBeNull();
  });
});

describe('optionGroups: what a product page lets a shopper choose', () => {
  const phone = [
    { attributes: { storage: '128GB', colour: 'Black', condition: 'New' } },
    { attributes: { storage: '128GB', colour: 'Blue', condition: 'New' } },
    { attributes: { storage: '256GB', colour: 'Black', condition: 'Refurbished' } },
  ];
  it('one group per kind of option, in the usual order, values in the order they were entered', () => {
    expect(optionGroups(phone)).toEqual([
      { key: 'storage', label: 'Storage', values: ['128GB', '256GB'] },
      { key: 'colour', label: 'Colour', values: ['Black', 'Blue'] },
      { key: 'condition', label: 'Condition', values: ['New', 'Refurbished'] },
    ]);
  });
  it('a product with no options has no groups, so the page falls back to its plain size picker', () => {
    expect(optionGroups([{ attributes: {} }, { attributes: null }, {}])).toEqual([]);
    expect(optionGroups([{ attributes: { size: 'M' } }])).toEqual([{ key: 'size', label: 'Size', values: ['M'] }]);
  });
  it('ignores blanks and keeps an unknown option after the known ones', () => {
    expect(optionGroups([{ attributes: { zzz: 'one', colour: 'Red', storage: '' } }]).map((g) => g.key)).toEqual(['colour', 'zzz']);
  });
});

describe('condition for the product feed', () => {
  it.each([['New', 'new'], ['Brand new', 'new'], ['Refurbished', 'refurbished'], ['Certified renewed', 'refurbished'], ['Used', 'used'], ['Ex-UK', 'used'], ['Open box', 'used'], ['Mint', null], ['', null]])(
    '%s -> %s', (text, expected) => expect(conditionOf({ condition: text })).toBe(expected),
  );
  it('is null when no condition is stated, so the feed says nothing rather than guessing', () => {
    expect(conditionOf({})).toBeNull();
    expect(conditionOf(null)).toBeNull();
  });
});

describe('cleanSpecs', () => {
  it('keeps filled rows and drops empty ones', () => {
    expect(cleanSpecs([{ label: ' Battery ', value: '5000 mAh' }, { label: '', value: '' }])).toEqual([{ label: 'Battery', value: '5000 mAh' }]);
    expect(cleanSpecs(undefined)).toEqual([]);
  });
  it('refuses half a row and absurd sizes', () => {
    expect(() => cleanSpecs([{ label: 'Battery', value: '' }])).toThrow(/both a name and a value/);
    expect(() => cleanSpecs([{ label: 'x'.repeat(41), value: 'y' }])).toThrow(/40 characters/);
    expect(() => cleanSpecs(Array.from({ length: 31 }, () => ({ label: 'a', value: 'b' })))).toThrow(/up to 30/);
    expect(() => cleanSpecs('nope')).toThrow(/list/);
  });
});

/** A tiny in-memory ProductCategory table: just the calls the section code makes. */
function fakeDb(initial: any[] = []) {
  const rows = [...initial];
  let n = 0;
  const db: any = {
    productCategory: {
      findUnique: async ({ where }: any) => rows.find((r) => r.shopId === where.shopId_slug.shopId && r.slug === where.shopId_slug.slug) ?? null,
      create: async ({ data }: any) => { const r = { id: `c${++n}`, isActive: true, section: null, ...data }; rows.push(r); return r; },
      update: async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data),
    },
  };
  return { db, rows };
}

describe('switching a section on', () => {
  it('creates the starter categories, filed under the section, and never twice', async () => {
    const { db, rows } = fakeDb();
    const first = await ensureSectionCategories(db, 'shopA', 'devices');
    expect(first.created).toEqual(devices.categories);
    expect(rows.every((r) => r.section === 'devices' && r.shopId === 'shopA')).toBe(true);
    expect(rows.find((r) => r.name === 'Phones')!.slug).toBe('phones');
    const again = await ensureSectionCategories(db, 'shopA', 'devices');
    expect(again.created).toEqual([]);
    expect(rows).toHaveLength(devices.categories.length);
  });
  it('can create only the ones the owner picked', async () => {
    const { db, rows } = fakeDb();
    await ensureSectionCategories(db, 'shopA', 'devices', ['Phones', 'Power banks', 'Not a category']);
    expect(rows.map((r) => r.name)).toEqual(['Phones', 'Power banks']);
  });
  it('files a category the shop already made by hand under the section, and leaves one in another section alone', async () => {
    const { db, rows } = fakeDb([
      { id: 'old', shopId: 'shopA', slug: 'phones', name: 'Phones', section: null },
      { id: 'other', shopId: 'shopA', slug: 'smartwatches-and-bands', name: 'Smartwatches and bands', section: 'watches' },
    ]);
    const result = await ensureSectionCategories(db, 'shopA', 'devices');
    expect(result.adopted).toEqual(['Phones']);
    expect(rows.find((r) => r.id === 'old')!.section).toBe('devices');
    expect(rows.find((r) => r.id === 'other')!.section).toBe('watches');
    expect(result.created).not.toContain('Smartwatches and bands');
  });
  it('never touches another shop\'s categories', async () => {
    const { db, rows } = fakeDb([{ id: 'x', shopId: 'shopB', slug: 'phones', name: 'Phones', section: null }]);
    await ensureSectionCategories(db, 'shopA', 'devices');
    expect(rows.find((r) => r.id === 'x')!.section).toBeNull();
    expect(rows.filter((r) => r.shopId === 'shopA' && r.slug === 'phones')).toHaveLength(1);
  });
  it('an unknown section does nothing', async () => {
    const { db, rows } = fakeDb();
    expect(await ensureSectionCategories(db, 'shopA', 'nope')).toEqual({ created: [], adopted: [] });
    expect(rows).toHaveLength(0);
  });
  it('section keys from sign-up are cleaned: known only, no repeats, stable order', () => {
    expect(cleanSectionKeys(['devices', 'nope', 'devices', 'clothes'])).toEqual(['clothes', 'devices']);
    expect(cleanSectionKeys(undefined)).toEqual([]);
    expect(cleanSectionKeys('devices')).toEqual([]);
  });
});

describe('the portal Sections service', () => {
  function service(shop: { sections: string[] }, categories: any[] = []) {
    const { db, rows } = fakeDb(categories);
    const prisma: any = {
      ...db,
      shop: { findUnique: async () => shop, update: async ({ data }: any) => Object.assign(shop, data) },
      productCategory: {
        ...db.productCategory,
        findMany: async () => rows.map((r) => ({ ...r, _count: { products: 0 } })),
        count: async ({ where }: any) => rows.filter((r) => r.section === where.section).length,
      },
      $transaction: async (fn: any) => fn(prisma),
    };
    return { svc: new PortalSectionsService(prisma), shop, rows };
  }

  it('starts with nothing switched on for a shop that predates sections', async () => {
    const { svc } = service({ sections: [] });
    const o = await svc.overview('shopA');
    expect(o.sections.every((s) => !s.enabled)).toBe(true);
    expect(o.sections.find((s) => s.key === 'devices')!.categories.every((c) => !c.exists)).toBe(true);
  });
  it('switching devices on records it and creates its categories; the overview then shows them', async () => {
    const { svc, shop, rows } = service({ sections: [] });
    const result = await svc.setEnabled('shopA', 'devices', true);
    expect(shop.sections).toEqual(['devices']);
    expect(result.created).toHaveLength(devices.categories.length);
    const section = result.overview.sections.find((s) => s.key === 'devices')!;
    expect(section.enabled).toBe(true);
    expect(section.categories.every((c) => c.exists && c.inSection)).toBe(true);
    expect(rows.length).toBe(devices.categories.length);
  });
  it('switching off only stops offering it: categories and products stay', async () => {
    const { svc, shop, rows } = service({ sections: [] });
    await svc.setEnabled('shopA', 'devices', true);
    await svc.setEnabled('shopA', 'devices', false);
    expect(shop.sections).toEqual([]);
    expect(rows.length).toBe(devices.categories.length);
  });
  it('several sections can be on at once, in a stable order', async () => {
    const { svc, shop } = service({ sections: [] });
    await svc.setEnabled('shopA', 'devices', true);
    await svc.setEnabled('shopA', 'watches', true);
    expect(shop.sections).toEqual(['watches', 'devices']);
  });
  it('refuses an unknown section', async () => {
    const { svc } = service({ sections: [] });
    await expect(svc.setEnabled('shopA', 'nope', true)).rejects.toThrow(/Unknown section/);
  });
});

describe('catalogue health no longer calls a phone or a watch a sizing problem', () => {
  const ctx = { shopName: 'S', shopSlug: 's', categoryCount: 3 };
  const product = (over: any) => ({ id: 'p', name: 'x', slug: 'x', brand: 'b', description: 'a long enough description '.repeat(6), imageUrls: ['u'], categoryId: 'c', variants: [{ sku: 'a', size: null, priceKes: 5000, stockOnHand: 1 }], ...over });
  it('a size at the end of a shoe\'s name is still flagged, but not a number at the end of a phone\'s', () => {
    const shoe = product({ id: 'shoe', name: 'Boss Casuals - EUR 40', section: 'footwear' });
    const legacy = product({ id: 'legacy', name: 'Kanly (UK 8)' });
    const phone = product({ id: 'phone', name: 'Itel Smart - 5', section: 'devices' });
    const flagged = analyseCatalog([shoe, legacy, phone], ctx).issues.find((i) => i.code === 'size-in-name')?.products.map((p) => p.id) ?? [];
    expect([...flagged].sort()).toEqual(['legacy', 'shoe']);
  });
});
