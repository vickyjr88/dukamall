import { ShopController } from '../../src/shop/shop.controller';

// The public host lookup must never return anything beyond what the storefront needs.
describe('GET /resolve-shop/:host (public)', () => {
  const fullShopRow = {
    id: 's1', slug: 'acme', name: 'Acme', customDomain: 'acme.test', status: 'ACTIVE',
    paystackSecretKey: 'enc:v1:secret', paystackPublicKey: 'pk_live_x', domainVerificationToken: 'tok',
    billingNotes: 'paid cash', notificationEmail: 'owner@acme.test', pendingDomain: null, trialEndsAt: null,
    theme: { primaryColor: '#000' },
  };

  it('returns only id, slug, name and customDomain', async () => {
    const controller = new ShopController({ resolveByHost: async () => fullShopRow } as any, {} as any);
    const body = await controller.resolveShop('acme.test');
    expect(Object.keys(body).sort()).toEqual(['customDomain', 'id', 'name', 'slug']);
    expect(JSON.stringify(body)).not.toMatch(/secret|paystack|billing|token|notification|owner@/i);
  });
});
