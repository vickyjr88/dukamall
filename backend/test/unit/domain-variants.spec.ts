import { domainVariants } from '../../src/common/domain-variants';

describe('domainVariants', () => {
  it('lists the apex and www forms from either', () => {
    expect(domainVariants('nairobigents.com').sort()).toEqual(['nairobigents.com', 'www.nairobigents.com']);
    expect(domainVariants('www.nairobigents.com').sort()).toEqual(['nairobigents.com', 'www.nairobigents.com']);
  });
  it('is case- and space-insensitive and never invents other subdomains', () => {
    expect(domainVariants('  WWW.Shop.CO.KE ').sort()).toEqual(['shop.co.ke', 'www.shop.co.ke']);
    expect(domainVariants('shop.nairobigents.com')).not.toContain('nairobigents.com');
  });
});
