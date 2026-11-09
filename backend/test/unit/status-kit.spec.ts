import sharp from 'sharp';
import { PostableProduct, buildStatusCaption, postLink, statusDetails } from '../../src/social/social-post';
import { fetchPhoto, isPrivateAddress } from '../../src/social/photo-fetch';
import { STATUS_HEIGHT, STATUS_WIDTH, drawable, readablePhone, renderStatusImage, statusOverlay, wordmark } from '../../src/social/status-image';
import { contrast, parseHex, statusPalette } from '../../src/social/status-palette';

const product = (over: Partial<PostableProduct> = {}): PostableProduct => ({
  id: 'P1', slug: 'seiko-5-sports', name: 'Seiko 5 Sports', brand: 'Seiko', categoryName: 'Watches', section: 'watches',
  imageUrl: 'https://cdn.shops.test/media/seiko.jpg', priceFrom: 12500, priceTo: 12500, offer: null, options: [], stockUnits: 4, createdAt: new Date('2026-10-01T00:00:00Z'), ...over,
});
const ctx = { shopName: 'Nairobi Gents', origin: 'https://nairobigents.shops.test', whatsapp: 'https://wa.me/254113206481', location: 'Moi Avenue, Nairobi' };
const sizes = { key: 'size', label: 'Size', values: ['EUR 36', 'EUR 37', 'EUR 38', 'EUR 41'] };
const colour = { key: 'colour', label: 'Colour', values: ['Black', 'White'] };
const storage = { key: 'storage', label: 'Storage', values: ['128GB', '256GB'] };
const condition = { key: 'condition', label: 'Condition', values: ['New'] };
const facts = (shopName = 'Nairobi Gents', primary = '#2438a8', accent = '#0f7a40') => ({ shopName, whatsapp: ctx.whatsapp, site: ctx.origin, palette: statusPalette(primary, accent) });

describe('what a Status says about each kind of product', () => {
  it('shoes list their sizes; a phone lists storage then colour; a watch in one form lists nothing', () => {
    expect(statusDetails([sizes])).toEqual([{ label: 'Sizes', value: 'EUR 36–38, 41' }]);
    expect(statusDetails([storage, colour])).toEqual([{ label: 'Storage', value: '128GB, 256GB' }, { label: 'Colours', value: 'Black, White' }]);
    expect(statusDetails([])).toEqual([]);
  });
  it('leaves out condition and never has more than two lines', () => {
    expect(statusDetails([condition, storage]).map((d) => d.label)).toEqual(['Storage']);
    expect(statusDetails([sizes, colour, storage]).length).toBe(2);
  });
  it('the text has the details, says to reply, and links to the product tagged as WhatsApp status', () => {
    const text = buildStatusCaption(product({ section: 'footwear', name: 'Nike Air Force 1', options: [sizes] }), ctx);
    expect(text).toContain('Nike Air Force 1');
    expect(text).toContain('💰 KES 12,500');
    expect(text).toContain('📏 Sizes: EUR 36–38, 41');
    expect(text).toContain('💬 Reply to this status to order');
    expect(text).toContain('https://nairobigents.shops.test/shop/seiko-5-sports?utm_source=whatsapp&utm_medium=social&utm_campaign=status');
  });
  it('a watch has no sizes line and an offer shows both prices', () => {
    const text = buildStatusCaption(product({ offer: { price: 9900, was: 12500 } }), ctx);
    expect(text).not.toMatch(/Sizes|📏/);
    expect(text).toContain('🔥 KES 9,900 (was KES 12,500)');
  });
  it('a Page post link is still tagged as before', () => {
    expect(postLink('https://s.test/', 'x', 'facebook')).toBe('https://s.test/shop/x?utm_source=facebook&utm_medium=social&utm_campaign=autopost');
  });
});

describe("the picture's colours come from the shop's theme and stay readable", () => {
  const themes: Array<[string, string]> = [['#ffffff', '#ffff00'], ['#000000', '#000000'], ['#2438a8', '#0f7a40'], ['#ff0000', '#00ff00'], ['#fafafa', '#eeeeee'], ['#f5f2ea', '#ffffff']];
  it.each(themes)('text keeps at least 4.5:1 against the background for %s / %s', (primary, accent) => {
    const p = statusPalette(primary, accent);
    const bg = parseHex(p.bg)!;
    for (const key of ['ink', 'muted', 'accent'] as const) expect(contrast(parseHex(p[key])!, bg)).toBeGreaterThanOrEqual(4.5);
    // Always a dark picture, whatever the shop picked.
    expect(contrast([255, 255, 255], bg)).toBeGreaterThan(10);
  });
  it('falls back to defaults for a missing or invalid colour, and takes 3-digit hex', () => {
    expect(statusPalette(null, undefined)).toEqual(statusPalette('#2438a8', '#d9b26a'));
    expect(statusPalette('not a colour', 'blue')).toEqual(statusPalette(null, null));
    expect(parseHex('#abc')).toEqual([170, 187, 204]);
  });
  it('tints the background with the shop colour, so two shops do not look the same', () => {
    expect(statusPalette('#2438a8', '#d9b26a').bg).not.toBe(statusPalette('#a81f1f', '#d9b26a').bg);
  });
});

describe('what can be drawn', () => {
  it('leaves out emoji and symbols the font lacks, keeps letters and apostrophes, tidies spaces', () => {
    expect(drawable('Nike 🔥 Air   Force 1')).toBe('Nike Air Force 1');
    expect(drawable('  Men’s Oxford  ')).toBe('Men’s Oxford');
    expect(drawable('🔥🔥')).toBe('');
  });
  it('shows a number as people know it', () => {
    expect(readablePhone('https://wa.me/254113206481')).toBe('0113 206 481');
    expect(readablePhone('0712345678')).toBe('0712 345 678');
    expect(readablePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(readablePhone('')).toBe('');
  });
  it('a long shop name still fits on one line', () => {
    for (const name of ['Nairobi Gents', 'The Very Long Name Of A Shop That Sells Everything In Nairobi And Beyond Ltd', 'X']) {
      const mark = wordmark(name, STATUS_WIDTH - 120);
      expect(mark.width).toBeLessThanOrEqual(STATUS_WIDTH - 120);
      expect(mark.text.length).toBeGreaterThan(0);
    }
    expect(wordmark('🔥', 900).text).toBe('SHOP');
  });
});

describe('the layout never runs into the call to action', () => {
  const FOOT = 1738;
  const cases: Array<[string, PostableProduct]> = [
    ['a watch in one form', product()],
    ['shoes with sizes', product({ name: 'Nike Air Force 1', options: [sizes] })],
    ['a phone with storage and colour', product({ name: 'iPhone 13', options: [storage, colour, condition] })],
    ['the worst case: a long name, an offer, two option lines, a price range', product({ name: 'Adidas Originals Superstar Foundation Leather Low Top Sneakers Limited Edition Gold', offer: { price: 7900, was: 10900 }, options: [{ key: 'size', label: 'Size', values: Array.from({ length: 30 }, (_, i) => `EUR ${30 + i}`) }, { key: 'colour', label: 'Colour', values: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Grey', 'Brown', 'Beige', 'Navy'] }] })],
    ['a name with no letters the font knows', product({ name: '🔥🔥🔥' })],
  ];
  it.each(cases)('%s', (_label, p) => {
    const { svg, photoHeight, textBottom } = statusOverlay(p, facts());
    expect(Number.isInteger(photoHeight)).toBe(true);
    expect(photoHeight).toBeGreaterThanOrEqual(760);
    expect(photoHeight).toBeLessThanOrEqual(1080);
    expect(170 + photoHeight).toBeLessThan(FOOT);
    expect(textBottom).toBeLessThan(FOOT - 10);
    expect(svg.startsWith('<svg')).toBe(true);
  });
  it('a product with nothing to list gets the biggest photo; one with a lot gets a smaller one', () => {
    expect(statusOverlay(product(), facts()).photoHeight).toBe(1080);
    expect(statusOverlay(product({ offer: { price: 1, was: 2 }, options: [sizes, colour] }), facts()).photoHeight).toBeLessThan(1080);
  });
});

describe('the finished picture', () => {
  const photo = () => sharp({ create: { width: 640, height: 480, channels: 3, background: '#888888' } }).png().toBuffer();
  it.each([
    ['shoes', product({ options: [sizes] })],
    ['a phone on offer', product({ name: 'iPhone 13', offer: { price: 70000, was: 78000 }, options: [storage, colour] })],
    ['a watch', product()],
  ])('is a 1080x1920 JPEG for %s', async (_l, p) => {
    const jpeg = await renderStatusImage(p, await photo(), facts());
    const meta = await sharp(jpeg).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', STATUS_WIDTH, STATUS_HEIGHT]);
  });
  it('is drawn in the shop’s colours: the background corner is the tinted dark colour, not the same for every shop', async () => {
    const corner = async (primary: string) => {
      const jpeg = await renderStatusImage(product(), await photo(), facts('Shop', primary));
      return (await sharp(jpeg).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer()).toJSON().data.slice(0, 3);
    };
    const blue = await corner('#2438a8');
    const red = await corner('#a81f1f');
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(red[0]).toBeGreaterThan(red[2]);
  });
  it('an unreadable photo is an error, not a blank picture', async () => {
    await expect(renderStatusImage(product(), Buffer.from('not a picture'), facts())).rejects.toBeTruthy();
  });
});

describe('a photo address is a shop owner’s choice, so the server fetches it carefully', () => {
  it.each(['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'garbage'])('%s is private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '172.32.0.1', '172.15.0.1', '203.0.113.9', '2606:4700::1111'])('%s is public', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  const ok = (body = 'image-bytes', headers: Record<string, string> = {}) => new Response(body, { status: 200, headers });
  const publicHost = async () => ['203.0.113.9'];

  it('fetches a public https photo', async () => {
    const fetched: string[] = [];
    const out = await fetchPhoto('https://cdn.shops.test/a.jpg', { resolve: publicHost, fetch: (async (u: any) => { fetched.push(String(u)); return ok(); }) as any });
    expect(out.toString()).toBe('image-bytes');
    expect(fetched).toEqual(['https://cdn.shops.test/a.jpg']);
  });
  it('refuses http, a private address, an address that cannot be found, and an IP literal on a private range', async () => {
    const never = (async () => { throw new Error('should not be fetched'); }) as any;
    await expect(fetchPhoto('http://cdn.shops.test/a.jpg', { resolve: publicHost, fetch: never })).rejects.toThrow('not an https address');
    await expect(fetchPhoto('https://internal.shops.test/a.jpg', { resolve: async () => ['10.0.0.8'], fetch: never })).rejects.toThrow('private address');
    await expect(fetchPhoto('https://sneaky.shops.test/a.jpg', { resolve: async () => ['203.0.113.9', '127.0.0.1'], fetch: never })).rejects.toThrow('private address');
    await expect(fetchPhoto('https://gone.shops.test/a.jpg', { resolve: async () => [], fetch: never })).rejects.toThrow('could not be found');
    await expect(fetchPhoto('https://169.254.169.254/latest/meta-data', { resolve: publicHost, fetch: never })).rejects.toThrow('private address');
    await expect(fetchPhoto('https://[::1]/a.jpg', { resolve: publicHost, fetch: never })).rejects.toThrow('private address');
    await expect(fetchPhoto('not a url', { resolve: publicHost, fetch: never })).rejects.toThrow('not a web address');
  });
  it('checks every redirect the same way, and gives up after three', async () => {
    const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
    const toPrivate = (async (u: any) => (String(u).includes('cdn') ? redirect('https://intranet.shops.test/secret.jpg') : ok())) as any;
    await expect(fetchPhoto('https://cdn.shops.test/a.jpg', { resolve: async (h) => (h.startsWith('intranet') ? ['192.168.0.9'] : ['203.0.113.9']), fetch: toPrivate })).rejects.toThrow('private address');
    const endless = (async () => redirect('https://cdn.shops.test/again.jpg')) as any;
    await expect(fetchPhoto('https://cdn.shops.test/a.jpg', { resolve: publicHost, fetch: endless })).rejects.toThrow('too many times');
    const relative = (async (u: any) => (String(u).endsWith('/a.jpg') ? redirect('/b.jpg') : ok('second'))) as any;
    expect((await fetchPhoto('https://cdn.shops.test/a.jpg', { resolve: publicHost, fetch: relative })).toString()).toBe('second');
  });
  it('refuses an error answer and a photo that is too large', async () => {
    await expect(fetchPhoto('https://cdn.shops.test/a.jpg', { resolve: publicHost, fetch: (async () => new Response('x', { status: 404 })) as any })).rejects.toThrow('HTTP 404');
    await expect(fetchPhoto('https://cdn.shops.test/a.jpg', { resolve: publicHost, fetch: (async () => ok('x', { 'content-length': '30000000' })) as any })).rejects.toThrow('too large');
  });
});
