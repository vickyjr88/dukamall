import { filterProducts, LightProduct, paginate, parseSort, sortProducts, summarise } from '../../src/portal-product/product-list';

let n = 0;
function product(name: string, over: Partial<LightProduct> & { variants?: LightProduct['variants'] } = {}): LightProduct {
  n += 1;
  return {
    id: `p${n}`, slug: name.toLowerCase().replace(/\s+/g, '-'), name, isFeatured: false, imageUrls: ['https://x/a.jpg'],
    createdAt: new Date(2026, 0, n), updatedAt: new Date(2026, 1, n),
    variants: [{ priceKes: 1000, wasPriceKes: null, stockOnHand: 10, isActive: true }],
    ...over,
  };
}
const none = { sold: new Map<string, number>(), views: new Map<string, number>() };

describe('summarise', () => {
  it('uses only the sizes a shopper can choose', () => {
    const s = summarise(product('A', { variants: [
      { priceKes: 3000, wasPriceKes: null, stockOnHand: 2, isActive: true },
      { priceKes: 1000, wasPriceKes: null, stockOnHand: 50, isActive: false },
    ] }));
    expect(s).toMatchObject({ minPriceKes: 3000, maxPriceKes: 3000, stock: 2, stockState: 'low' });
  });
  it('treats a was-price that is not above the price as no offer', () => {
    expect(summarise(product('A', { variants: [{ priceKes: 1000, wasPriceKes: 1000, stockOnHand: 5, isActive: true }] })).onOffer).toBe(false);
    expect(summarise(product('A', { variants: [{ priceKes: 800, wasPriceKes: 1000, stockOnHand: 5, isActive: true }] })).onOffer).toBe(true);
  });
  it('says sold out when nothing is left or nothing is shown', () => {
    expect(summarise(product('A', { variants: [] })).stockState).toBe('out');
    expect(summarise(product('A', { variants: [{ priceKes: 1, wasPriceKes: null, stockOnHand: -2, isActive: true }] })).stock).toBe(0);
  });
  it('knows a product with no usable photo', () => {
    expect(summarise(product('A', { imageUrls: [] })).hasPhoto).toBe(false);
    expect(summarise(product('A', { imageUrls: ['  '] })).hasPhoto).toBe(false);
    expect(summarise(product('A', { imageUrls: 'nope' })).hasPhoto).toBe(false);
  });
});

describe('filterProducts', () => {
  const plenty = product('Plenty');
  const low = product('Low', { variants: [{ priceKes: 1, wasPriceKes: null, stockOnHand: 2, isActive: true }] });
  const out = product('Out', { variants: [{ priceKes: 1, wasPriceKes: null, stockOnHand: 0, isActive: true }], imageUrls: [] });
  const all = [plenty, low, out];
  it('keeps the stock lists apart', () => {
    expect(filterProducts(all, { stock: 'in' })).toEqual([plenty]);
    expect(filterProducts(all, { stock: 'low' })).toEqual([low]);
    expect(filterProducts(all, { stock: 'out' })).toEqual([out]);
  });
  it('finds products without a photo', () => {
    expect(filterProducts(all, { flag: 'no_photo' })).toEqual([out]);
  });
});

describe('sortProducts', () => {
  const cheap = product('Cheap', { variants: [{ priceKes: 500, wasPriceKes: null, stockOnHand: 4, isActive: true }] });
  const dear = product('Dear', { variants: [{ priceKes: 9000, wasPriceKes: null, stockOnHand: 40, isActive: true }] });
  const free = product('Unpriced', { variants: [] });
  const names = (list: LightProduct[]) => list.map((p) => p.name);
  it('puts an unpriced product last whichever way prices run', () => {
    expect(names(sortProducts([free, dear, cheap], 'price_asc', none))).toEqual(['Cheap', 'Dear', 'Unpriced']);
    expect(names(sortProducts([free, cheap, dear], 'price_desc', none))).toEqual(['Dear', 'Cheap', 'Unpriced']);
  });
  it('sorts by stock and by sales', () => {
    expect(names(sortProducts([cheap, dear], 'stock_desc', none))).toEqual(['Dear', 'Cheap']);
    const sold = new Map([[cheap.id, 9], [dear.id, 1]]);
    expect(names(sortProducts([dear, cheap], 'sold', { sold, views: new Map() }))).toEqual(['Cheap', 'Dear']);
  });
  it('orders names the way a person reads them', () => {
    const a10 = product('Shoe 10'); const a9 = product('Shoe 9');
    expect(names(sortProducts([a10, a9], 'name', none))).toEqual(['Shoe 9', 'Shoe 10']);
  });
  it('breaks ties newest first, and does not change the input', () => {
    const a = product('A'); const b = product('B');
    const input = [a, b];
    expect(names(sortProducts(input, 'sold', none))).toEqual(['B', 'A']);
    expect(input).toEqual([a, b]);
  });
});

describe('paginate and parseSort', () => {
  it('clamps a page past the end to the last page', () => {
    const r = paginate([1, 2, 3, 4, 5], 9, 2);
    expect(r).toMatchObject({ items: [5], page: 3, totalPages: 3, total: 5 });
  });
  it('is one empty page for an empty list', () => {
    expect(paginate([], 1, 25)).toMatchObject({ items: [], page: 1, totalPages: 1, total: 0 });
  });
  it('falls back to newest for an unknown sort', () => {
    expect(parseSort('drop table')).toBe('newest');
    expect(parseSort('price_asc')).toBe('price_asc');
  });
});
