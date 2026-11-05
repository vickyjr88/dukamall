import { Prisma } from '@prisma/client';
import { withoutPrivateCosts } from '../../src/common/private-costs';

describe('what the shop pays never reaches a shopper', () => {
  it('removes cost fields at any depth, in lists and nested rows', () => {
    const order = {
      id: 'o1', totalKes: new Prisma.Decimal(4200),
      lines: [{ id: 'l1', priceKes: new Prisma.Decimal(4200), unitCostKes: new Prisma.Decimal(2600), variant: { sku: 'A', product: { name: 'Puma', costKes: new Prisma.Decimal(2600), brand: 'Puma' } } }],
    };
    const clean = withoutPrivateCosts([order]);
    expect(JSON.stringify(clean)).not.toMatch(/costKes|unitCostKes|2600/);
    expect(clean[0].lines[0].variant.product).toEqual({ name: 'Puma', brand: 'Puma' });
  });

  it('keeps everything else exactly, including dates and decimals', () => {
    const when = new Date('2026-11-01T10:00:00Z');
    const price = new Prisma.Decimal('4200.50');
    const clean = withoutPrivateCosts({ createdAt: when, priceKes: price, tags: ['a', 'b'], note: null });
    expect(clean.createdAt).toBe(when);
    expect(clean.priceKes).toBe(price);
    expect(clean).toMatchObject({ tags: ['a', 'b'], note: null });
  });

  it('handles empty and primitive bodies', () => {
    expect(withoutPrivateCosts(null)).toBeNull();
    expect(withoutPrivateCosts('ok')).toBe('ok');
    expect(withoutPrivateCosts([])).toEqual([]);
  });
});
