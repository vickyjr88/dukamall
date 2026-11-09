import { IntegrationsService } from '../../src/integrations/integrations.service';
import { PostableProductsService } from '../../src/social/postable-products.service';
import { SocialPostingService } from '../../src/social/social-posting.service';
import { cleanup, close, makeShop, prisma } from './helpers';

const integrations = new IntegrationsService(prisma);
const products = new PostableProductsService(prisma);
const engine = new SocialPostingService(prisma, integrations, products);
const owner = { id: null, email: 'owner@shop.test' };

const realFetch = global.fetch;
type Call = { host: 'fb' | 'th'; method: string; path: string; token: string; body: any };
let calls: Call[] = [];
let queue: Array<{ match: RegExp; host?: 'fb' | 'th'; status: number; data: any }> = [];
let seq = 0;

beforeEach(async () => {
  process.env.SOCIAL_PUBLISH_WAIT_MS = '200';
  process.env.SOCIAL_POLL_MS = '5';
  // The same Pages and accounts are used by every test, and one belongs to one shop, so nothing may survive from the test before.
  await prisma.shopIntegration.deleteMany({});
  calls = []; queue = []; seq = 0; integrations.invalidate();
  (engine as any).lastRenewTry.clear();
  global.fetch = jest.fn(async (url: any, init: any) => {
    const u = new URL(String(url));
    const host = u.host === 'graph.facebook.com' ? 'fb' : u.host === 'graph.threads.net' ? 'th' : null;
    if (!host) return realFetch(url, init);
    const path = u.pathname.replace(/^\/v[\d.]+\//, '');
    const body = init?.body ? JSON.parse(init.body) : null;
    const token = host === 'fb' ? String(init?.headers?.Authorization ?? '').replace('Bearer ', '') : body?.access_token ?? u.searchParams.get('access_token') ?? '';
    const call: Call = { host, method: init?.method ?? 'GET', path, token, body };
    calls.push(call);
    const i = queue.findIndex((q) => q.match.test(path) && (!q.host || q.host === host));
    if (i >= 0) { const q = queue.splice(i, 1)[0]; return new Response(JSON.stringify(q.data), { status: q.status }); }
    const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status });
    if (host === 'fb') {
      if (/\/photos$/.test(path)) return json({ id: `ph_${++seq}`, post_id: `${path.split('/')[0]}_${1000 + seq}` });
      if (call.method === 'DELETE') return json({ success: true });
    } else {
      if (path === 'me') return json({ id: '40242283428718911', username: 'shopthreads' });
      if (path === 'refresh_access_token') return json({ access_token: `RENEWED-${++seq}-token-0123456789abcdef`, token_type: 'bearer', expires_in: 5_184_000 });
      if (/\/threads$/.test(path)) return json({ id: `c_${++seq}` });
      if (/^c_\d+$/.test(path)) return json({ status: 'FINISHED' });
      if (/\/threads_publish$/.test(path)) return json({ id: `t_${seq}` });
      if (/^t_\d+$/.test(path) && call.method === 'GET') return json({ permalink: `https://www.threads.net/@shopthreads/post/${path}` });
      if (/^t_\d+$/.test(path) && call.method === 'DELETE') return json({ success: true });
    }
    return json({ error: { code: 100, message: 'unknown' } }, 404);
  }) as any;
});
afterEach(() => { global.fetch = realFetch; delete process.env.SOCIAL_POSTING; });
afterAll(async () => {
  await prisma.shopIntegration.deleteMany({}); await prisma.adminAuditLog.deleteMany({ where: { action: { startsWith: 'integration.' } } });
  await cleanup(); await close();
});

const fbPosts = () => calls.filter((c) => c.host === 'fb' && c.path.endsWith('/photos'));
const thPublishes = () => calls.filter((c) => c.host === 'th' && c.path.endsWith('/threads_publish'));

let uid = 0;
async function addProduct(shopId: string, over: { name: string; section?: string | null; brand?: string; images?: string[]; active?: boolean; categoryActive?: boolean; variants: Array<{ price: number; stock: number; size?: string; attributes?: Record<string, string>; was?: number; active?: boolean }> }) {
  uid += 1;
  const category = over.section === null ? null : await prisma.productCategory.create({ data: { shopId, name: `Cat ${uid}`, slug: `cat-${uid}-${Math.random().toString(36).slice(2, 6)}`, section: over.section ?? 'footwear', isActive: over.categoryActive ?? true } });
  const product = await prisma.product.create({
    data: {
      shopId, name: over.name, slug: `p-${uid}-${Math.random().toString(36).slice(2, 6)}`, brand: over.brand ?? null, isActive: over.active ?? true,
      categoryId: category?.id, imageUrls: over.images ?? [`https://cdn.shops.test/media/${uid}.jpg`],
      variants: { create: over.variants.map((v, i) => ({ sku: `SKU-${uid}-${i}`, name: `${over.name} ${i}`, size: v.size ?? null, attributes: v.attributes ?? {}, priceKes: v.price, wasPriceKes: v.was ?? null, stockOnHand: v.stock, isActive: v.active ?? true, position: i })) },
    },
  });
  return product;
}

/** A shop with its own Facebook Page connected (and optionally Threads), and a few products in different sections. */
async function postingShop(tag: string, opts: { threads?: boolean; page?: string; account?: string; name?: string } = {}) {
  const shop = await makeShop({ name: opts.name ?? 'Nairobi Gents', whatsappNumber: '0113 206 481', address: 'Moi Avenue, Nairobi' });
  const page = opts.page ?? '405520572643076';
  await integrations.save(shop.id, 'FACEBOOK', { enabled: true, config: { pageId: page }, secrets: { pageAccessToken: `PAGE-TOKEN-${tag}-0123456789abcdef` } }, owner);
  if (opts.threads) await integrations.save(shop.id, 'THREADS', { enabled: true, secrets: { accessToken: `THREADS-TOKEN-${tag}-0123456789abcdef` }, ...(opts.account ? { config: { userId: opts.account } } : {}) }, owner);
  return shop;
}
const NINE = new Date('2026-11-08T06:05:00Z'); // 09:05 in Nairobi

describe('what a shop could post', () => {
  it('describes each product by the shop\'s own sections, with only what is still in stock', async () => {
    const shop = await makeShop();
    await addProduct(shop.id, { name: 'Nike Air Force 1', section: 'footwear', brand: 'Nike', variants: [{ price: 8200, stock: 3, size: '40', attributes: { size: '40' } }, { price: 8200, stock: 2, size: '41', attributes: { size: '41' } }, { price: 8200, stock: 0, size: '42', attributes: { size: '42' } }] });
    await addProduct(shop.id, { name: 'iPhone 13', section: 'devices', variants: [{ price: 78000, stock: 2, attributes: { storage: '128GB', colour: 'Black', condition: 'New' } }, { price: 92000, stock: 1, attributes: { storage: '256GB', colour: 'Black', condition: 'New' } }] });
    await addProduct(shop.id, { name: 'Seiko 5 Sports', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await addProduct(shop.id, { name: 'Old style shoe', section: null, variants: [{ price: 3000, stock: 5, size: '43' }] }); // made before sections existed: its plain size counts
    const list = await products.forShop(shop.id);
    const by = Object.fromEntries(list.map((p) => [p.name, p]));
    expect(Object.keys(by).sort()).toEqual(['Nike Air Force 1', 'Old style shoe', 'Seiko 5 Sports', 'iPhone 13']);
    expect(by['Nike Air Force 1'].options).toEqual([{ key: 'size', label: 'Size', values: ['40', '41'] }]); // 42 is out of stock
    expect(by['Nike Air Force 1']).toMatchObject({ priceFrom: 8200, priceTo: 8200, section: 'footwear', stockUnits: 5 });
    expect(by['iPhone 13'].options.map((o) => [o.key, o.values])).toEqual([['storage', ['128GB', '256GB']], ['colour', ['Black']], ['condition', ['New']]]);
    expect(by['iPhone 13']).toMatchObject({ priceFrom: 78000, priceTo: 92000 });
    expect(by['Seiko 5 Sports'].options).toEqual([]);
    expect(by['Old style shoe'].options).toEqual([{ key: 'size', label: 'Size', values: ['43'] }]);
  });

  it('leaves out what a shopper could not buy: sold out, switched off, in a category that is switched off, or in no stock in the shown variants', async () => {
    const shop = await makeShop();
    await addProduct(shop.id, { name: 'Sold out', variants: [{ price: 1000, stock: 0 }] });
    await addProduct(shop.id, { name: 'Switched off', active: false, variants: [{ price: 1000, stock: 5 }] });
    await addProduct(shop.id, { name: 'Hidden category', categoryActive: false, variants: [{ price: 1000, stock: 5 }] });
    await addProduct(shop.id, { name: 'Only an inactive variant in stock', variants: [{ price: 1000, stock: 5, active: false }, { price: 1000, stock: 0 }] });
    await addProduct(shop.id, { name: 'Fine', variants: [{ price: 1000, stock: 5 }] });
    expect((await products.forShop(shop.id)).map((p) => p.name)).toEqual(['Fine']);
  });

  it('shows the sale price, and has a photo or not; it only ever reads the shop\'s own catalogue', async () => {
    const a = await makeShop();
    const b = await makeShop();
    await addProduct(a.id, { name: 'On sale', variants: [{ price: 3500, was: 4500, stock: 2 }, { price: 4500, stock: 2 }] });
    await addProduct(a.id, { name: 'No photo', images: [], variants: [{ price: 1000, stock: 2 }] });
    await addProduct(b.id, { name: 'Belongs to B', variants: [{ price: 1000, stock: 2 }] });
    const list = await products.forShop(a.id);
    expect(list.map((p) => p.name).sort()).toEqual(['No photo', 'On sale']);
    expect(list.find((p) => p.name === 'On sale')).toMatchObject({ priceFrom: 3500, priceTo: 4500, offer: { price: 3500, was: 4500 } });
    expect(list.find((p) => p.name === 'No photo')!.imageUrl).toBeNull(); // the engine never posts it (not postable)
    expect((await engine.preview(a.id)).previews.FACEBOOK.product!.name).toBe('On sale');
    expect((await products.forShop(b.id)).map((p) => p.name)).toEqual(['Belongs to B']);
  });
});

describe('posting on a schedule', () => {
  it('posts nothing until the owner switches a channel on, then posts a due slot once, from the shop\'s own Page, with its own words', async () => {
    const shop = await postingShop('A');
    await addProduct(shop.id, { name: 'Seiko 5 Sports', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    expect(await engine.tick(NINE)).toEqual({ posted: 0, skipped: 0, failed: 0 });
    expect(calls).toHaveLength(0);

    await engine.updateSettings(shop.id, { facebookEnabled: true }, 'owner@shop.test');
    expect((await engine.tick(NINE)).posted).toBe(1);
    expect((await engine.tick(NINE)).posted).toBe(0); // the slot is taken
    expect(fbPosts()).toHaveLength(1);
    const post = fbPosts()[0];
    expect(post.path).toBe('405520572643076/photos');
    expect(post.token).toBe('PAGE-TOKEN-A-0123456789abcdef');
    expect(post.body).toMatchObject({ published: true });
    expect(post.body.url).toMatch(/^https:\/\//);
    expect(post.body.caption).toContain('Seiko 5 Sports');
    expect(post.body.caption).toContain('utm_source=facebook&utm_medium=social&utm_campaign=autopost');
    expect(post.body.caption).toContain('📍 Moi Avenue, Nairobi');
    expect(post.body.caption).toContain('https://wa.me/254113206481');
    expect(post.body.caption).toContain('#NairobiGents #Watches');
    const row = await prisma.socialPost.findFirstOrThrow({ where: { shopId: shop.id } });
    expect([row.channel, row.slotKey, row.status, row.triggeredBy, row.externalId]).toEqual(['FACEBOOK', '2026-11-08@09:00', 'POSTED', 'schedule', '405520572643076_1001']);
    expect(row.permalink).toBe('https://www.facebook.com/405520572643076_1001');
  });

  it('every shop posts on its own: its own Page, products, slots, rotation and counts, with the same slot time', async () => {
    const a = await postingShop('A', { page: '405520572643076' });
    const b = await postingShop('B', { page: '405520572643077', name: 'Phone Hub' });
    await addProduct(a.id, { name: 'A watch', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await addProduct(b.id, { name: 'A phone', section: 'devices', variants: [{ price: 78000, stock: 2, attributes: { storage: '128GB' } }] });
    await engine.updateSettings(a.id, { facebookEnabled: true }, 'x');
    await engine.updateSettings(b.id, { facebookEnabled: true }, 'x');
    expect((await engine.tick(NINE)).posted).toBe(2);
    const byPage = Object.fromEntries(fbPosts().map((c) => [c.path.split('/')[0], c]));
    expect(byPage['405520572643076'].token).toBe('PAGE-TOKEN-A-0123456789abcdef');
    expect(byPage['405520572643076'].body.caption).toContain('A watch');
    expect(byPage['405520572643077'].token).toBe('PAGE-TOKEN-B-0123456789abcdef');
    expect(byPage['405520572643077'].body.caption).toContain('A phone');
    expect(byPage['405520572643077'].body.caption).toContain('💾 Storage: 128GB');
    expect(byPage['405520572643077'].body.caption).toContain('#PhoneHub #Phones');
    expect(byPage['405520572643077'].body.caption).not.toContain('A watch');
    expect((await engine.status(a.id)).facebook.posted).toBe(1);
    expect((await engine.list(b.id, {})).total).toBe(1);
    expect((await engine.list(a.id, {})).items.map((i) => i.productName)).toEqual(['A watch']);
  });

  it('a shop that switched a channel on but has not connected it posts nothing and says so; so does a shop with the channel off', async () => {
    const shop = await makeShop();
    await addProduct(shop.id, { name: 'Seiko', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await engine.updateSettings(shop.id, { facebookEnabled: true, threadsEnabled: true }, 'x');
    expect((await engine.tick(NINE)).posted).toBe(0);
    expect(calls).toHaveLength(0);
    const r: any = await engine.postNow(shop.id, 'owner@shop.test', undefined, 'THREADS');
    expect(r).toMatchObject({ status: 'FAILED' });
    expect(r.detail).toMatch(/Threads is not connected for this shop/);
    const status = await engine.status(shop.id);
    expect([status.facebook.connected, status.facebook.enabled, status.facebook.nextPostAt]).toEqual([false, true, null]);
  });

  it('three slots a day post three different products, and a slot long past is not posted late', async () => {
    const shop = await postingShop('A');
    for (const name of ['One', 'Two', 'Three', 'Four']) await addProduct(shop.id, { name: `Watch ${name}`, section: 'watches', brand: name, variants: [{ price: 12500, stock: 4 }] });
    await engine.updateSettings(shop.id, { facebookEnabled: true }, 'x');
    await engine.tick(NINE);
    await engine.tick(new Date('2026-11-08T10:10:00Z')); // 13:10
    await engine.tick(new Date('2026-11-08T16:10:00Z')); // 19:10
    const ids = (await prisma.socialPost.findMany({ where: { shopId: shop.id, status: 'POSTED' } })).map((r) => r.productId);
    expect(new Set(ids).size).toBe(3);
    await prisma.socialPost.deleteMany({ where: { shopId: shop.id } });
    expect((await engine.tick(new Date('2026-11-08T14:00:00Z'))).posted).toBe(0); // 17:00: the 13:00 slot is four hours old
  });

  it('records a skipped slot when there is nothing to post, and retries when Facebook is unavailable but not a refusal', async () => {
    const empty = await postingShop('A', { page: '405520572643076' });
    await engine.updateSettings(empty.id, { facebookEnabled: true }, 'x');
    expect((await engine.tick(NINE)).skipped).toBe(1);
    expect((await prisma.socialPost.findFirstOrThrow({ where: { shopId: empty.id } })).detail).toMatch(/No product in stock/);

    const shop = await postingShop('B', { page: '405520572643077' });
    await addProduct(shop.id, { name: 'Seiko', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await engine.updateSettings(shop.id, { facebookEnabled: true }, 'x');
    queue = [{ match: /\/photos$/, status: 500, data: { error: { code: 2, message: 'Service unavailable' } } }];
    await engine.tick(NINE);
    const row = await prisma.socialPost.findFirstOrThrow({ where: { shopId: shop.id } });
    expect([row.status, row.attempts]).toEqual(['RETRY', 1]);
    await prisma.socialPost.update({ where: { id: row.id }, data: { createdAt: NINE, updatedAt: NINE } });
    await engine.tick(new Date(NINE.getTime() + 60_000)); // too soon
    expect(fbPosts().filter((c) => c.path.startsWith('405520572643077'))).toHaveLength(1);
    expect((await engine.tick(new Date(NINE.getTime() + 6 * 60_000))).posted).toBe(1);
    expect(await prisma.socialPost.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'POSTED', attempts: 2 });

    const refused = await postingShop('C', { page: '405520572643078' });
    await addProduct(refused.id, { name: 'Seiko', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await engine.updateSettings(refused.id, { facebookEnabled: true }, 'x');
    queue = [{ match: /405520572643078\/photos$/, status: 403, data: { error: { code: 200, message: 'Requires pages_manage_posts' } } }];
    expect((await engine.tick(new Date('2026-11-08T06:20:00Z'))).failed).toBe(1);
    expect((await prisma.socialPost.findFirstOrThrow({ where: { shopId: refused.id } })).detail).toBe('200: Requires pages_manage_posts');
  });

  it('the server-wide switch stops everything, whatever any shop has set', async () => {
    const shop = await postingShop('A');
    await addProduct(shop.id, { name: 'Seiko', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await engine.updateSettings(shop.id, { facebookEnabled: true }, 'x');
    process.env.SOCIAL_POSTING = 'false';
    expect((await engine.tick(NINE)).posted).toBe(0);
    expect(await engine.postNow(shop.id, 'owner@shop.test')).toMatchObject({ status: 'FAILED' });
    expect((await engine.status(shop.id)).allowed).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('the owner posting and taking down', () => {
  it('Post now works with the schedule off, can name a product, and only that shop\'s own; a post can be taken down, only by its own shop', async () => {
    const a = await postingShop('A', { page: '405520572643076' });
    const b = await postingShop('B', { page: '405520572643077' });
    const wanted = await addProduct(a.id, { name: 'Chosen one', section: 'watches', variants: [{ price: 5000, stock: 1 }] });
    await addProduct(a.id, { name: 'Other', section: 'watches', variants: [{ price: 5000, stock: 1 }] });
    const bProduct = await addProduct(b.id, { name: 'B only', section: 'watches', variants: [{ price: 5000, stock: 1 }] });

    const result: any = await engine.postNow(a.id, 'owner@a.test', wanted.id);
    expect(result.status).toBe('POSTED');
    expect(fbPosts()[0].body.caption).toContain('Chosen one');
    const row = await prisma.socialPost.findFirstOrThrow({ where: { shopId: a.id } });
    expect([row.triggeredBy, row.slotKey.startsWith('manual@')]).toEqual(['owner@a.test', true]);
    expect(((await engine.postNow(a.id, 'owner@a.test', bProduct.id)) as any).status).toBe('SKIPPED'); // B's product is not A's to post

    expect(await engine.remove(b.id, row.id)).toEqual({ removed: false, detail: 'That post is not live' }); // not B's post
    expect(await engine.remove(a.id, row.id)).toEqual({ removed: true, detail: null });
    const del = calls.at(-1)!;
    expect([del.method, del.path, del.token]).toEqual(['DELETE', row.externalId, 'PAGE-TOKEN-A-0123456789abcdef']);
    expect((await prisma.socialPost.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('REMOVED');
    expect((await engine.remove(a.id, row.id)).removed).toBe(false);
  });
});

describe('Threads', () => {
  it('posts a photo: makes the item, waits for it, publishes, and keeps the link; each shop with its own login', async () => {
    const shop = await postingShop('A', { threads: true, account: '40242283428718911' });
    await addProduct(shop.id, { name: 'Seiko 5 Sports', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await engine.updateSettings(shop.id, { threadsEnabled: true }, 'x');
    expect((await engine.tick(NINE)).posted).toBe(1);
    expect(fbPosts()).toHaveLength(0); // Facebook is off: nothing goes there
    const made = calls.find((c) => c.host === 'th' && c.path === '40242283428718911/threads')!;
    expect(made.body).toMatchObject({ media_type: 'IMAGE' });
    expect(made.body.text).toContain('utm_source=threads');
    expect(Array.from(made.body.text).length).toBeLessThanOrEqual(480);
    const row = await prisma.socialPost.findFirstOrThrow({ where: { shopId: shop.id } });
    expect([row.channel, row.status, row.permalink?.startsWith('https://www.threads.net/@shopthreads/post/')]).toEqual(['THREADS', 'POSTED', true]);

    const other = await postingShop('B', { threads: true, account: '40242283428718922', page: '405520572643077' });
    await addProduct(other.id, { name: 'Another', section: 'watches', variants: [{ price: 5000, stock: 1 }] });
    calls = [];
    await engine.postNow(other.id, 'owner@b.test', undefined, 'THREADS');
    expect(calls.find((c) => c.path === '40242283428718922/threads')).toBeTruthy();
    expect(calls.every((c) => c.token === '' || c.token.includes('THREADS-TOKEN-B') || c.token.includes('RENEWED'))).toBe(true);
  });

  it('a picture it cannot use fails at once, a slow one is tried again, and taking a post down reaches the right account', async () => {
    const shop = await postingShop('A', { threads: true, account: '40242283428718911' });
    await addProduct(shop.id, { name: 'Seiko', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await engine.updateSettings(shop.id, { threadsEnabled: true }, 'x');
    queue = [{ match: /^c_\d+$/, host: 'th', status: 200, data: { status: 'ERROR', error_message: 'Unsupported image' } }];
    expect((await engine.tick(NINE)).failed).toBe(1);
    expect((await prisma.socialPost.findFirstOrThrow({ where: { shopId: shop.id } })).detail).toBe('Threads could not use the picture: Unsupported image');

    const ok: any = await engine.postNow(shop.id, 'owner@shop.test', undefined, 'THREADS');
    expect(ok.status).toBe('POSTED');
    expect(await engine.remove(shop.id, ok.id)).toEqual({ removed: true, detail: null });
    expect(calls.at(-1)).toMatchObject({ host: 'th', method: 'DELETE', path: ok.externalId });
    const ok2: any = await engine.postNow(shop.id, 'owner@shop.test', undefined, 'THREADS');
    queue = [{ match: /^t_\d+$/, host: 'th', status: 400, data: { error: { code: 10, message: 'Delete permission missing' } } }];
    expect(await engine.remove(shop.id, ok2.id)).toEqual({ removed: false, detail: '10: Delete permission missing. Delete it in the Threads app instead, then it can be ignored here.' });
  });

  it('finds the shop\'s Threads account from the token and renews the login, writing the new token back to the shop\'s own connection', async () => {
    const shop = await postingShop('A', { threads: true }); // no account id typed
    await addProduct(shop.id, { name: 'Seiko', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    await engine.updateSettings(shop.id, { threadsEnabled: true }, 'x');
    await engine.maintainThreadsLogin(shop.id, NINE);

    const row = await prisma.shopIntegration.findFirstOrThrow({ where: { shopId: shop.id, provider: 'THREADS' } });
    expect(row.externalId).toBe('40242283428718911');
    expect((row.config as any).userId).toBe('40242283428718911');
    expect(row.tokenExpiresAt!.getTime()).toBe(NINE.getTime() + 5_184_000_000);
    expect(row.updatedBy).toBe('the app (renewed automatically)');
    const stored = (await integrations.resolve(shop.id, 'THREADS'))!;
    expect(stored.secrets.accessToken).toMatch(/^RENEWED-\d+-token/); // the shop's own saved token is now the renewed one
    expect(row.secrets).not.toContain('RENEWED'); // and it is encrypted at rest

    calls = [];
    expect((await engine.tick(NINE)).posted).toBe(1);
    const publishCall = calls.find((c) => c.path.endsWith('/threads'))!;
    expect(publishCall.token).toBe(stored.secrets.accessToken); // the next post uses the renewed token

    // Not renewed again within the hour, nor while it has plenty of time left.
    const before = calls.filter((c) => c.path === 'refresh_access_token').length;
    await engine.maintainThreadsLogin(shop.id, new Date(NINE.getTime() + 2 * 3_600_000));
    expect(calls.filter((c) => c.path === 'refresh_access_token').length).toBe(before);

    const audit = await prisma.adminAuditLog.findMany({ where: { shopId: shop.id, action: 'integration.renewed' } });
    expect(audit.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(audit)).not.toContain('RENEWED');
    expect(JSON.stringify(audit)).not.toContain('THREADS-TOKEN');
  });

  it('a renewal that is refused is not fatal: the current login keeps working and the reason is shown', async () => {
    const shop = await postingShop('A', { threads: true, account: '40242283428718911' });
    queue = [{ match: /^refresh_access_token$/, host: 'th', status: 400, data: { error: { code: 190, message: 'Token must be at least 24 hours old' } } }];
    await engine.maintainThreadsLogin(shop.id, NINE);
    const row = await prisma.shopIntegration.findFirstOrThrow({ where: { shopId: shop.id, provider: 'THREADS' } });
    expect(row.lastError).toBe('Renewal: 190: Token must be at least 24 hours old');
    expect((await integrations.resolve(shop.id, 'THREADS'))!.secrets.accessToken).toBe('THREADS-TOKEN-A-0123456789abcdef');
    expect((await engine.status(shop.id)).threads.tokenError).toContain('Token must be at least 24 hours old');
    await addProduct(shop.id, { name: 'Seiko', section: 'watches', variants: [{ price: 12500, stock: 4 }] });
    expect(((await engine.postNow(shop.id, 'owner@shop.test', undefined, 'THREADS')) as any).status).toBe('POSTED');
  });
});
