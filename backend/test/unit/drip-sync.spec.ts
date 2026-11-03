import { planImport, type DripProduct, type ShopSnapshot } from '../../src/drip-sync/drip-sync.plan';
import { sign, verifySignature } from '../../src/drip-sync/drip-sync.signature';

const product = (over: Partial<DripProduct> & { slug: string }): DripProduct => ({
  id: `id-${over.slug}`,
  name: over.slug,
  brand: 'Nike',
  description: 'A shoe.',
  imageUrls: ['https://api.example/media/a.jpg'],
  category: { name: 'Sneakers', slug: 'sneakers' },
  variants: [
    { sku: `${over.slug}-40`, name: 'EUR 40', size: 'EUR 40', priceKes: 3500, inStock: true },
    { sku: `${over.slug}-41`, name: 'EUR 41', size: 'EUR 41', priceKes: 3500, inStock: false },
  ],
  ...over,
});

const shop = (over: Partial<ShopSnapshot> = {}): ShopSnapshot => ({ skus: new Set(), slugs: new Set(), owned: new Map(), ...over });

describe('planImport', () => {
  it('creates a Drip product the shop does not have', () => {
    const plan = planImport([product({ slug: 'tn-black' })], shop());
    expect(plan.create.map((p) => p.slug)).toEqual(['tn-black']);
  });

  it('leaves alone a product the shop has under a different name, matched by SKU', () => {
    const plan = planImport([product({ slug: 'tn-black' })], shop({ skus: new Set(['tn-black-40']), slugs: new Set(['nike-tn-black-curated']) }));
    expect(plan.create).toHaveLength(0);
    expect(plan.alreadyThere).toBe(1);
  });

  it('reports, and does not create, a product whose address is taken by something else', () => {
    const plan = planImport([product({ slug: 'tn-black' })], shop({ slugs: new Set(['tn-black']) }));
    expect(plan.create).toHaveLength(0);
    expect(plan.conflicts).toEqual([{ slug: 'tn-black', reason: expect.any(String) }]);
  });

  it('skips a product that is not sellable yet (no photo, or no sizes) so a later run can pick it up', () => {
    const plan = planImport([product({ slug: 'a', imageUrls: [] }), product({ slug: 'b', variants: [] })], shop());
    expect(plan.create).toHaveLength(0);
    expect(plan.incomplete).toEqual(['a', 'b']);
  });

  it('adds only the missing sizes to a product it created earlier', () => {
    const drip = product({ slug: 'tn-black' });
    const plan = planImport([drip], shop({ skus: new Set(['tn-black-40']), owned: new Map([[drip.id, { id: 'p1', skus: new Set(['tn-black-40']) }]]) }));
    expect(plan.create).toHaveLength(0);
    expect(plan.addSizes).toEqual([{ productId: 'p1', dripId: drip.id, slug: 'tn-black', variants: [expect.objectContaining({ sku: 'tn-black-41' })] }]);
  });

  it('never adds sizes to a curated product, even when Drip has sizes the shop lacks', () => {
    // 40 is on the shop's own (syncSourceId-less) product; Drip also has 41. Nothing may be added to it.
    const plan = planImport([product({ slug: 'tn-black' })], shop({ skus: new Set(['tn-black-40']) }));
    expect(plan.addSizes).toHaveLength(0);
    expect(plan.create).toHaveLength(0);
  });

  it('is a no-op once everything is there', () => {
    const drip = product({ slug: 'tn-black' });
    const plan = planImport([drip], shop({ skus: new Set(['tn-black-40', 'tn-black-41']), owned: new Map([[drip.id, { id: 'p1', skus: new Set(['tn-black-40', 'tn-black-41']) }]]) }));
    expect(plan).toMatchObject({ create: [], addSizes: [], conflicts: [], alreadyThere: 1 });
  });

  it('does not create two products with the same address in one run', () => {
    const plan = planImport([product({ slug: 'x', id: '1' }), product({ slug: 'x', id: '2', variants: [{ sku: 'other', name: 'EUR 40', size: 'EUR 40', priceKes: 1, inStock: true }] })], shop());
    expect(plan.create).toHaveLength(1);
    expect(plan.conflicts).toHaveLength(1);
  });
});

describe('verifySignature', () => {
  const secret = 'shared-secret';
  const body = '{"event":"catalogue.changed"}';
  const now = 1_800_000_000;

  it('accepts a request signed with the secret', () => {
    expect(verifySignature(secret, body, sign(secret, body, now), now + 5)).toBe(true);
  });
  it('rejects a wrong secret, an altered body, a missing header, and no configured secret', () => {
    expect(verifySignature(secret, body, sign('other', body, now), now)).toBe(false);
    expect(verifySignature(secret, body + ' ', sign(secret, body, now), now)).toBe(false);
    expect(verifySignature(secret, body, undefined, now)).toBe(false);
    expect(verifySignature('', body, sign('', body, now), now)).toBe(false);
  });
  it('rejects a captured request replayed outside the tolerance window', () => {
    expect(verifySignature(secret, body, sign(secret, body, now), now + 301)).toBe(false);
    expect(verifySignature(secret, body, sign(secret, body, now), now - 301)).toBe(false);
  });
  it('rejects malformed headers without throwing', () => {
    expect(verifySignature(secret, body, 'garbage', now)).toBe(false);
    expect(verifySignature(secret, body, 't=abc,v1=zz', now)).toBe(false);
  });
});
