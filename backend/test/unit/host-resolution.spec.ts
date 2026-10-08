import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ShopService } from '../../src/shop/shop.service';

// Which hosts resolve to a shop. PLATFORM_DOMAIN is "shops.test" here.
function serviceWith(shops: any[]) {
  const findFirst = jest.fn(async ({ where }: any) =>
    shops.find((s) => where.OR.some((c: any) => (c.customDomain && s.customDomain === c.customDomain) || (c.slug && s.slug === c.slug))) ?? null);
  return { service: new ShopService({ shop: { findFirst } } as any), findFirst };
}
const msa = { id: '1', slug: 'msa', customDomain: null, status: 'ACTIVE' };
const withDomain = { id: '2', slug: 'acme', customDomain: 'shop.acme.co.ke', status: 'ACTIVE' };

describe('ShopService.resolveByHost', () => {
  beforeEach(() => { process.env.PLATFORM_DOMAIN = 'shops.test'; });

  it('resolves <slug>.<platform domain>', async () => {
    const { service } = serviceWith([msa]);
    await expect(service.resolveByHost('msa.shops.test')).resolves.toMatchObject({ id: '1' });
  });

  it('ignores a port, and is case-insensitive', async () => {
    const { service } = serviceWith([msa]);
    await expect(service.resolveByHost('MSA.Shops.Test:3202')).resolves.toMatchObject({ id: '1' });
  });

  it('does NOT resolve a slug on some other domain (msa.attacker.com)', async () => {
    const { service } = serviceWith([msa]);
    await expect(service.resolveByHost('msa.attacker.com')).rejects.toThrow(NotFoundException);
  });

  it('does not treat a look-alike parent domain as the platform domain', async () => {
    const { service } = serviceWith([msa]);
    await expect(service.resolveByHost('msa.evil-shops.test')).rejects.toThrow(NotFoundException);
    await expect(service.resolveByHost('msa.shops.test.evil.com')).rejects.toThrow(NotFoundException);
  });

  it('resolves a verified custom domain whatever the first label is', async () => {
    const { service } = serviceWith([withDomain]);
    await expect(service.resolveByHost('shop.acme.co.ke')).resolves.toMatchObject({ id: '2' });
  });

  it('does not match a bare platform domain or a bare host to any shop', async () => {
    const { service } = serviceWith([msa]);
    await expect(service.resolveByHost('shops.test')).rejects.toThrow(NotFoundException);
    await expect(service.resolveByHost('localhost')).rejects.toThrow(NotFoundException);
  });

  it('allows <slug>.localhost for local development', async () => {
    const { service } = serviceWith([msa]);
    await expect(service.resolveByHost('msa.localhost:3202')).resolves.toMatchObject({ id: '1' });
  });

  it('refuses a suspended shop', async () => {
    const { service } = serviceWith([{ ...msa, status: 'SUSPENDED' }]);
    await expect(service.resolveByHost('msa.shops.test')).rejects.toThrow(ForbiddenException);
  });
});
