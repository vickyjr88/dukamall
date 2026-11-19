import { catalogueMessage, cleanTag, channelHref, priceText, productMessage, safePath, tagLink, CATALOGUE_MAX } from '../../src/portal-share/share-links';

describe('cleanTag', () => {
  it('keeps a utm value to safe characters', () => {
    expect(cleanTag('Black Friday 2026!')).toBe('black-friday-2026');
    expect(cleanTag('  <script>  ')).toBe('script');
    expect(cleanTag('', 'fallback')).toBe('fallback');
    expect(cleanTag('x'.repeat(100))).toHaveLength(40);
  });
});

describe('tagLink', () => {
  it('adds the three tags and keeps what was already in the address', () => {
    const out = new URL(tagLink('https://nairobigents.com/shop/black-boots?size=42', { source: 'WhatsApp', campaign: 'Black Friday' }));
    expect(out.searchParams.get('size')).toBe('42');
    expect(out.searchParams.get('utm_source')).toBe('whatsapp');
    expect(out.searchParams.get('utm_medium')).toBe('social');
    expect(out.searchParams.get('utm_campaign')).toBe('black-friday');
  });
  it('replaces tags that are already there instead of doubling them', () => {
    const out = new URL(tagLink('https://x.test/a?utm_source=old', { source: 'facebook' }));
    expect(out.searchParams.getAll('utm_source')).toEqual(['facebook']);
  });
});

describe('safePath', () => {
  it('accepts a path on the shop', () => {
    expect(safePath('/shop/black-boots')).toBe('/shop/black-boots');
    expect(safePath('/')).toBe('/');
    expect(safePath('/pages/about?x=1')).toBe('/pages/about?x=1');
  });
  it('refuses anything that could leave the shop', () => {
    for (const bad of ['//evil.test', 'https://evil.test', 'javascript:alert(1)', '/\\evil.test', '/a/../b', 'shop/x', '', '/with space', '/javascript:alert(1)']) {
      expect(safePath(bad)).toBeNull();
    }
  });
});

describe('priceText and messages', () => {
  it('says "From" for a range and shows the old price of an offer', () => {
    expect(priceText({ minKes: 3500, maxKes: 3500 })).toBe('KES 3,500');
    expect(priceText({ minKes: 3500, maxKes: 4200 })).toBe('From KES 3,500');
    expect(priceText({ minKes: 3500, maxKes: 3500, wasKes: 4500 })).toBe('KES 3,500 (was 4,500)');
    expect(priceText({ minKes: null, maxKes: null })).toBe('');
  });
  it('builds a product message with the link last', () => {
    const msg = productMessage({ name: 'Air Max 90', priceText: 'KES 3,800', link: 'https://x.test/shop/a' });
    expect(msg.split('\n')[0]).toBe('Air Max 90');
    expect(msg.endsWith('https://x.test/shop/a')).toBe(true);
  });
  it('builds a catalogue message, numbered, capped, ending with the shop', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ name: `Shoe ${i + 1}`, priceText: 'KES 1,000', link: `https://x.test/shop/s${i + 1}` }));
    const msg = catalogueMessage({ shopName: 'Nairobi Gents', items, shopLink: 'https://x.test' });
    expect(msg.startsWith('New at Nairobi Gents')).toBe(true);
    expect(msg).toContain(`${CATALOGUE_MAX}. Shoe ${CATALOGUE_MAX}`);
    expect(msg).not.toContain(`${CATALOGUE_MAX + 1}. Shoe`);
    expect(msg.trimEnd().endsWith('See everything: https://x.test')).toBe(true);
  });
});

describe('channelHref', () => {
  const input = { link: 'https://x.test/shop/a?utm_source=x&b=1', text: 'Air Max & more', message: 'Air Max\n\nhttps://x.test/shop/a' };
  it('encodes the message for WhatsApp and the link for the others', () => {
    expect(channelHref('whatsapp', input)).toBe(`https://wa.me/?text=${encodeURIComponent(input.message)}`);
    expect(channelHref('facebook', input)).toBe(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(input.link)}`);
    expect(channelHref('x', input)).toContain(encodeURIComponent('Air Max & more'));
    expect(channelHref('telegram', input)).toContain('t.me/share/url');
  });
  it('has no address for the phone share sheet or a copied link', () => {
    expect(channelHref('share', input)).toBeNull();
    expect(channelHref('link', input)).toBeNull();
  });
});
