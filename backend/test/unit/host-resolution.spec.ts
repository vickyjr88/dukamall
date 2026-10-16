import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ShopService } from '../../src/shop/shop.service';

// Which hosts resolve to a shop. PLATFORM_DOMAIN is "shops.test" here.
function serviceWith(shops: any[]) {
  const findMany = jest.fn(async ({ where }: any) =>
    shops.filter((s) => where.OR.some((c: any) => (c.customDomain?.in && c.customDomain.in.includes(s.customDomain)) || (c.slug && s.slug === c.slug))));
  return { service: new ShopService({ shop: { findMany } } as any), findMany };
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

  describe('www and apex are the same site', () => {
    const apex = { id: '3', slug: 'nairobi', customDomain: 'nairobigents.com', status: 'ACTIVE' };
    const www = { id: '4', slug: 'other', customDomain: 'www.example.org', status: 'ACTIVE' };

    it('www.<domain> reaches the shop whose primary domain is the apex', async () => {
      await expect(serviceWith([apex]).service.resolveByHost('www.nairobigents.com')).resolves.toMatchObject({ id: '3', customDomain: 'nairobigents.com' });
    });
    it('the apex reaches a shop whose primary domain is the www form', async () => {
      await expect(serviceWith([www]).service.resolveByHost('example.org')).resolves.toMatchObject({ id: '4', customDomain: 'www.example.org' });
    });
    it('the exact primary domain still resolves directly', async () => {
      await expect(serviceWith([apex]).service.resolveByHost('nairobigents.com')).resolves.toMatchObject({ id: '3' });
    });
    it('prefers an exact match over a twin when two shops hold the two forms', async () => {
      const { service } = serviceWith([apex, { id: '5', slug: 'x', customDomain: 'www.nairobigents.com', status: 'ACTIVE' }]);
      await expect(service.resolveByHost('www.nairobigents.com')).resolves.toMatchObject({ id: '5' });
      await expect(service.resolveByHost('nairobigents.com')).resolves.toMatchObject({ id: '3' });
    });
    it('does not match unrelated domains, or a subdomain of the domain', async () => {
      const { service } = serviceWith([apex]);
      await expect(service.resolveByHost('shop.nairobigents.com')).rejects.toThrow(NotFoundException);
      await expect(service.resolveByHost('www.nairobigents.co.ke')).rejects.toThrow(NotFoundException);
      await expect(service.resolveByHost('www.notnairobigents.com')).rejects.toThrow(NotFoundException);
    });
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
