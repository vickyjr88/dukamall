import {
  PostableProduct, THREADS_LIMIT, buildCaption, buildThreadsCaption, cleanTimes, compactSizes, dueSlots, hashtags, isPostable, nextSlot, optionLines, pickProduct, postLink,
} from '../../src/social/social-post';

const DAY = 86_400_000;
const product = (over: Partial<PostableProduct> = {}): PostableProduct => ({
  id: 'P1', slug: 'seiko-5-sports', name: 'Seiko 5 Sports', brand: 'Seiko', categoryName: 'Watches', section: 'watches',
  imageUrl: 'https://cdn.shops.test/media/seiko.jpg', priceFrom: 12500, priceTo: 12500, offer: null, options: [], stockUnits: 4, createdAt: new Date('2026-10-01T00:00:00Z'), ...over,
});
const ctx = { shopName: 'Nairobi Gents', origin: 'https://nairobigents.shops.test', whatsapp: 'https://wa.me/254113206481', location: 'Moi Avenue, Nairobi' };
const size = (...values: string[]) => ({ key: 'size', label: 'Size', values });
const colour = (...values: string[]) => ({ key: 'colour', label: 'Colour', values });

describe('how a post reads for each kind of product', () => {
  it('a watch that comes in one form has no option line, and names the shop, its link, WhatsApp and address', () => {
    const text = buildCaption(product(), ctx, '2026-11-08');
    expect(text).toContain('Seiko 5 Sports');
    expect(text).toContain('💰 KES 12,500');
    expect(text).not.toMatch(/Sizes|Colour|Storage/);
    expect(text).toContain('🛒 Order online: https://nairobigents.shops.test/shop/seiko-5-sports?utm_source=facebook&utm_medium=social&utm_campaign=autopost');
    expect(text).toContain('💬 WhatsApp: https://wa.me/254113206481');
    expect(text).toContain('📍 Moi Avenue, Nairobi');
    expect(text.endsWith('#NairobiGents #Watches #Seiko')).toBe(true);
    expect(text).not.toContain('DripEmporium');
  });

  it('shoes and clothes list the sizes in stock in short form, and the colours', () => {
    const shoes = buildCaption(product({ section: 'footwear', name: 'Nike Air Force 1', options: [size('EUR 40', 'EUR 41', 'EUR 42', 'EUR 44')] }), ctx, 'd');
    expect(shoes).toContain('📏 Sizes: EUR 40–42, 44');
    const clothes = buildCaption(product({ section: 'clothes', name: 'Linen Shirt', options: [size('S', 'M', 'L'), colour('Black', 'White')] }), ctx, 'd');
    expect(clothes).toContain('📏 Sizes: S, M, L');
    expect(clothes).toContain('🎨 Colours: Black, White');
    expect(clothes).toContain('#Fashion');
  });

  it('phones list storage, colour and condition, each as its own line', () => {
    const lines = optionLines([
      { key: 'storage', label: 'Storage', values: ['128GB', '256GB'] }, colour('Black'), { key: 'condition', label: 'Condition', values: ['New'] },
    ]);
    expect(lines).toEqual(['💾 Storage: 128GB, 256GB', '🎨 Colour: Black', '🏷️ Condition: New']);
    expect(hashtags(product({ section: 'devices', brand: 'Samsung' }), 'Phone Hub')).toBe('#PhoneHub #Phones #Samsung');
  });

  it('an unknown kind of option still reads, and a long list is cut', () => {
    expect(optionLines([{ key: 'option', label: 'Option', values: ['6.1 inch', '6.7 inch'] }])).toEqual(['▫️ Option: 6.1 inch, 6.7 inch']);
    const many = optionLines([{ key: 'option', label: 'Option', values: Array.from({ length: 12 }, (_, i) => `v${i}`) }])[0];
    expect(many.endsWith('v7 and more')).toBe(true);
    expect(optionLines([{ key: 'colour', label: 'Colour', values: [] }])).toEqual([]);
  });

  it('a sale shows both prices, a range says "From", and the opening varies by product and day', () => {
    expect(buildCaption(product({ offer: { price: 10500, was: 12500 } }), ctx, 'd')).toContain('🔥 KES 10,500 (was KES 12,500)');
    expect(buildCaption(product({ priceFrom: 3000, priceTo: 5000 }), ctx, 'd')).toContain('💰 From KES 3,000');
    expect(buildCaption(product(), ctx, 'd1')).toBe(buildCaption(product(), ctx, 'd1'));
    const openings = new Set(Array.from({ length: 30 }, (_, i) => buildCaption(product({ id: `P${i}` }), ctx, 'd').split('\n')[0]));
    expect(openings.size).toBeGreaterThan(3);
  });

  it('sizes are written as short as they can be read', () => {
    expect(compactSizes(['EUR 36', 'EUR 37', 'EUR 38', 'EUR 39', 'EUR 41', 'EUR 42'])).toBe('EUR 36–39, 41–42');
    expect(compactSizes(['S', 'M', 'L'])).toBe('S, M, L');
    expect(compactSizes([])).toBe('');
    expect(postLink('https://a.test/', 'x', 'threads')).toBe('https://a.test/shop/x?utm_source=threads&utm_medium=social&utm_campaign=autopost');
  });
});

describe('Threads fits 500 characters whatever the product', () => {
  it('drops the address, then the options, then cuts the name, never the link or the price', () => {
    const short = buildThreadsCaption(product({ section: 'footwear', options: [size('EUR 40', 'EUR 41')] }), ctx, 'd');
    expect(Array.from(short).length).toBeLessThanOrEqual(THREADS_LIMIT);
    expect(short).toContain('utm_source=threads');
    expect(short).toContain('📏 Sizes: EUR 40–41');
    expect(short).toContain('📍 Moi Avenue');

    const long = buildThreadsCaption(
      product({ name: 'Samsung Galaxy S24 Ultra Titanium Black Dual Sim With Warranty And Free Case '.repeat(5), options: [{ key: 'storage', label: 'Storage', values: Array.from({ length: 14 }, (_, i) => `${64 * (i + 1)}GB`) }, colour('Black', 'White', 'Silver')] }),
      { ...ctx, location: 'A very long address '.repeat(12) }, 'd',
    );
    expect(Array.from(long).length).toBeLessThanOrEqual(THREADS_LIMIT);
    expect(long).toContain('KES 12,500');
    expect(long).toMatch(/\/shop\/seiko-5-sports\?utm_source=threads/);
    expect(long).toContain('…');
  });
});

describe('is it good enough to post unattended', () => {
  it('needs a name, an https photo, a price and an address on the shop', () => {
    expect(isPostable(product())).toBe(true);
    for (const bad of [null, product({ name: 'ab' }), product({ imageUrl: '' }), product({ imageUrl: 'http://x/y.jpg' }), product({ priceFrom: 0 }), product({ slug: '' })]) expect(isPostable(bad as any)).toBe(false);
    expect(isPostable({ ...product(), imageUrl: null })).toBe(false);
  });
});

describe('when', () => {
  it('slots are Nairobi times; one is due from its time until 90 minutes after, and a missed one is dropped', () => {
    expect(cleanTimes(['19:00', '9:00', '09:00', 'noon', '13:00', '25:00'])).toEqual(['09:00', '13:00', '19:00']);
    const times = ['09:00', '13:00', '19:00'];
    expect(dueSlots(new Date('2026-11-08T05:59:00Z'), times)).toEqual([]);
    expect(dueSlots(new Date('2026-11-08T06:00:00Z'), times).map((s) => s.slotKey)).toEqual(['2026-11-08@09:00']);
    expect(dueSlots(new Date('2026-11-08T07:30:00Z'), times).map((s) => s.slotKey)).toEqual(['2026-11-08@09:00']);
    expect(dueSlots(new Date('2026-11-08T07:31:00Z'), times)).toEqual([]);
    expect(nextSlot(new Date('2026-11-08T08:00:00Z'), times)!.toISOString()).toBe('2026-11-08T10:00:00.000Z');
    expect(nextSlot(new Date('2026-11-08T17:00:00Z'), times)!.toISOString()).toBe('2026-11-09T06:00:00.000Z');
    expect(nextSlot(new Date(), [])).toBeNull();
  });
});

describe('which product next', () => {
  it('never-posted products first (best stocked first), then longest ago; the cooldown holds; a small shop repeats only after a week; brands alternate', () => {
    const now = new Date('2026-11-08T06:00:00Z');
    const a = product({ id: 'A', brand: 'Nike', options: [size('40')], stockUnits: 1 });
    const b = product({ id: 'B', brand: 'Adidas', options: [size('40', '41', '42', '43')], stockUnits: 12 });
    const c = product({ id: 'C', brand: 'Puma' });
    const last = new Map<string, Date>([['C', new Date(now.getTime() - 3 * DAY)]]);
    expect(pickProduct({ candidates: [a, b, c], lastPosted: last, now, cooldownDays: 30 })!.id).toBe('B');
    expect(pickProduct({ candidates: [a, c], lastPosted: last, now, cooldownDays: 30 })!.id).toBe('A');
    expect(pickProduct({ candidates: [c], lastPosted: last, now, cooldownDays: 30 })).toBeNull();
    const only = product({ id: 'ONLY' });
    expect(pickProduct({ candidates: [only], lastPosted: new Map([['ONLY', new Date(now.getTime() - 10 * DAY)]]), now, cooldownDays: 30 })!.id).toBe('ONLY');
    expect(pickProduct({ candidates: [only], lastPosted: new Map([['ONLY', new Date(now.getTime() - 5 * DAY)]]), now, cooldownDays: 30 })).toBeNull();
    const n1 = product({ id: 'N1', brand: 'Nike' });
    const n2 = product({ id: 'N2', brand: 'Nike' });
    const p1 = product({ id: 'P1', brand: 'Puma', stockUnits: 1 });
    expect(pickProduct({ candidates: [n1, n2, p1], lastPosted: new Map(), lastBrand: 'Nike', now, cooldownDays: 30 })!.id).toBe('P1');
    expect(pickProduct({ candidates: [n1, n2], lastPosted: new Map(), lastBrand: 'Nike', now, cooldownDays: 30 })!.id).toBe('N1');
  });
});
