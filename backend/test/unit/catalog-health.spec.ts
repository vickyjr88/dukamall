import { analyseCatalog, HealthProduct } from '../../src/portal-catalog-health/catalog-health';

const ctx = { shopName: 'Nairobi Gents', shopSlug: 'nairobigents', categoryCount: 3 };

function product(over: Partial<HealthProduct> & { id: string; name: string }): HealthProduct {
  return {
    slug: over.name.toLowerCase().replace(/\W+/g, '-'),
    brand: 'Nike',
    description: 'A clean, low-profile court-style sneaker in black with a chunky white sole and a smooth upper that keeps the look sharp and minimal. Wipe clean with a damp cloth.',
    imageUrls: [`https://img/${over.id}.jpg`],
    categoryId: 'cat-1',
    variants: [{ sku: `${over.id}-40`, size: 'EUR 40', priceKes: 3700, stockOnHand: 2 }],
    ...over,
  };
}

const codes = (products: HealthProduct[], c = ctx) => analyseCatalog(products, c).issues.map((i) => i.code);
const issue = (products: HealthProduct[], code: string, c = ctx) => analyseCatalog(products, c).issues.find((i) => i.code === code);

describe('analyseCatalog', () => {
  it('reports nothing for a tidy catalog', () => {
    const result = analyseCatalog([product({ id: 'a', name: 'Air Max 90' }), product({ id: 'b', name: 'Dunk Low' })], ctx);
    expect(result.issues).toEqual([]);
    expect(result).toMatchObject({ checked: 2, clean: 2 });
  });

  it('catches a KES 10 size among KES 3,700 ones (the Air Force 1 Nola typo)', () => {
    const nola = product({
      id: 'n', name: 'Air Force 1 Nola',
      variants: ['36', '37', '38', '39', '40'].map((s) => ({ sku: `n-${s}`, size: `EUR ${s}`, priceKes: s === '37' ? 10 : 3700, stockOnHand: 1 })),
    });
    const hit = issue([nola], 'price-outlier');
    expect(hit?.severity).toBe('problem');
    expect(hit?.products[0].detail).toContain('EUR 37 is KES 10');
    expect(hit?.products[0].detail).toContain('KES 3,700');
  });

  it('does not flag a genuinely cheap item, or normal price variation between sizes', () => {
    const socks = product({ id: 's', name: 'Socks', variants: [{ sku: 's', size: null, priceKes: 250, stockOnHand: 1 }] });
    const sizes = product({ id: 'z', name: 'Samba', variants: [3500, 3500, 3800, 4000].map((p, i) => ({ sku: `z${i}`, size: `EUR ${40 + i}`, priceKes: p, stockOnHand: 1 })) });
    expect(codes([socks, sizes])).not.toContain('price-outlier');
  });

  it('finds sizes typed into the name, but not when the product has real sizes', () => {
    const typed = product({ id: 't', name: 'Boss Casuals Black - EUR 40', variants: [{ sku: 't', size: null, priceKes: 3500, stockOnHand: 1 }] });
    const fine = product({ id: 'f', name: 'Adidas Samba - EUR 40' });
    const hit = issue([typed, fine], 'size-in-name');
    expect(hit?.products.map((p) => p.id)).toEqual(['t']);
  });

  it('groups products that share a first photo and names the other product', () => {
    const a = product({ id: 'a', name: 'Timberland Casuals', imageUrls: ['same.jpg'] });
    const b = product({ id: 'b', name: 'Timberland Casual Grey', imageUrls: ['same.jpg'] });
    const c = product({ id: 'c', name: 'Other' });
    const hit = issue([a, b, c], 'duplicate-image');
    expect(hit?.products.map((p) => p.id).sort()).toEqual(['a', 'b']);
    expect(hit?.products.find((p) => p.id === 'a')?.detail).toContain('Timberland Casual Grey');
  });

  it('flags missing and placeholder brands (own shop name) and missing descriptions', () => {
    const none = product({ id: 'n', name: 'A', brand: null });
    const placeholder = product({ id: 'p', name: 'B', brand: 'nairobi gents' });
    const empty = product({ id: 'e', name: 'C', description: '  ' });
    const short = product({ id: 's', name: 'D', description: 'Nice shoe.' });
    const list = [none, placeholder, empty, short];
    expect(issue(list, 'no-brand')?.products.map((p) => p.id)).toEqual(['n']);
    expect(issue(list, 'brand-is-shop-name')?.products.map((p) => p.id)).toEqual(['p']);
    expect(issue(list, 'no-description')?.products.map((p) => p.id)).toEqual(['e']);
    expect(issue(list, 'short-description')?.products.map((p) => p.id)).toEqual(['s']);
  });

  it('flags uncategorised products when categories exist, and a single note when none do', () => {
    const loose = product({ id: 'l', name: 'Loose', categoryId: null });
    expect(issue([loose], 'no-category')?.products).toHaveLength(1);
    const none = issue([loose], 'no-categories', { ...ctx, categoryCount: 0 });
    expect(none?.products).toEqual([]);
    expect(codes([loose], { ...ctx, categoryCount: 0 })).not.toContain('no-category');
  });

  it('reports products with no photo, no sizes, a slug equal to the shop, or no stock anywhere', () => {
    const bare = product({ id: 'b', name: 'Bare', imageUrls: [], variants: [] });
    const slugged = product({ id: 's', name: 'Puma Roma', slug: 'nairobigents' });
    const sold = product({ id: 'o', name: 'Sold out', variants: [{ sku: 'o', size: 'EUR 40', priceKes: 3500, stockOnHand: 0 }] });
    const list = [bare, slugged, sold];
    expect(issue(list, 'no-image')?.products.map((p) => p.id)).toEqual(['b']);
    expect(issue(list, 'no-variants')?.products.map((p) => p.id)).toEqual(['b']);
    expect(issue(list, 'slug-is-shop-slug')?.products.map((p) => p.id)).toEqual(['s']);
    expect(issue(list, 'out-of-stock')?.products.map((p) => p.id)).toEqual(['o']);
  });

  it('lists problems before tips and counts only problem-free products as clean', () => {
    const result = analyseCatalog(
      [product({ id: 'a', name: 'Fine', brand: null }), product({ id: 'b', name: 'Broken', imageUrls: [] })],
      ctx,
    );
    const severities = result.issues.map((i) => i.severity);
    expect(severities).toEqual([...severities].sort((x, y) => (x === y ? 0 : x === 'problem' ? -1 : 1)));
    expect(result.clean).toBe(1); // the missing brand is only a tip
  });
});
