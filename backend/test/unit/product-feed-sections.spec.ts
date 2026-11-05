import { ProductFeedService } from '../../src/product-feed/product-feed.service';
import { feedCsv, feedXml } from '../../src/product-feed/feed-formats';

const shop = { id: 's1', name: 'Phone Hub', currency: 'KES', slug: 'phonehub', customDomain: 'phonehub.test' };

function service(products: any[]) {
  const prisma: any = {
    shop: { findUniqueOrThrow: async () => shop },
    product: { findMany: async () => products },
  };
  return new ProductFeedService(prisma);
}

const variant = (sku: string, attributes: Record<string, string>, size: string | null = null, stock = 1) =>
  ({ sku, attributes, size, priceKes: 50000, stockOnHand: stock, isActive: true });

describe('product feed for sections', () => {
  const phone = {
    id: 'p1', slug: 'iphone-13', name: 'iPhone 13', description: 'A phone', brand: 'Apple', imageUrls: ['https://x/a.jpg'],
    category: { name: 'Phones', section: 'devices' },
    variants: [
      variant('IP-128-BLK-NEW', { storage: '128GB', colour: 'Black', condition: 'New' }),
      variant('IP-128-BLK-REF', { storage: '128GB', colour: 'Black', condition: 'Refurbished' }),
    ],
  };
  const charger = {
    id: 'p2', slug: 'charger', name: 'Fast charger', description: null, brand: null, imageUrls: ['https://x/c.jpg'],
    category: { name: 'Accessories', section: 'devices' },
    variants: [variant('CH-1', {})],
  };
  const shirt = {
    id: 'p3', slug: 'tee', name: 'Tee', description: null, brand: null, imageUrls: ['https://x/t.jpg'],
    category: { name: 'Tees', section: 'clothes' },
    variants: [variant('T-M-RED', { size: 'M', colour: 'Red' }, 'M')],
  };
  const legacyShoe = {
    id: 'p4', slug: 'shoe', name: 'Shoe', description: null, brand: 'Nike', imageUrls: ['https://x/s.jpg'],
    category: { name: 'Sneakers', section: null },
    variants: [variant('S-42', {}, '42')],
  };

  it('puts each phone option, its condition and the Google category in the feed', async () => {
    const rows = await service([phone]).buildRows('s1');
    expect(rows.map((r) => r.condition)).toEqual(['new', 'refurbished']);
    expect(rows[0].title).toBe('iPhone 13 - 128GB / Black / New');
    expect(rows[0].color).toBe('Black');
    expect(rows[0].size).toBe('');
    expect(rows[0].googleProductCategory).toBe('Electronics > Communications > Telephony > Mobile Phones');
  });

  it('treats a device with no storage as an accessory', async () => {
    const [row] = await service([charger]).buildRows('s1');
    expect(row.googleProductCategory).toBe('Electronics > Electronics Accessories');
    expect(row.title).toBe('Fast charger');
  });

  it('keeps size and colour for clothes, and a shop without sections exactly as before', async () => {
    const rows = await service([shirt, legacyShoe]).buildRows('s1');
    expect(rows[0]).toMatchObject({ size: 'M', color: 'Red', condition: 'new', title: 'Tee - M / Red' });
    expect(rows[1]).toMatchObject({ size: '42', color: '', condition: 'new', title: 'Shoe - 42', googleProductCategory: '' });
  });

  it('writes the new columns to the CSV and XML feeds', async () => {
    const rows = await service([phone]).buildRows('s1');
    const csv = feedCsv(rows);
    expect(csv.split('\n')[0]).toContain('google_product_category,color,size');
    expect(feedXml('Phone Hub', 'https://phonehub.test', rows)).toContain('<g:condition>refurbished</g:condition>');
    expect(feedXml('Phone Hub', 'https://phonehub.test', rows)).toContain('<g:color>Black</g:color>');
  });
});
