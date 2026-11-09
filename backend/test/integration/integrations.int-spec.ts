import { MarketingSummaryService } from '../../src/marketing/marketing-summary.service';
import { DailyReportScheduler } from '../../src/daily-report/daily-report.scheduler';
import { DailyReportService } from '../../src/daily-report/daily-report.service';
import { WhatsAppService } from '../../src/daily-report/whatsapp.service';
import { IntegrationsService } from '../../src/integrations/integrations.service';
import { cleanup, close, makeShop, prisma } from './helpers';

const service = new IntegrationsService(prisma);
const owner = { id: null, email: 'owner@shop.test' };
const WA_TOKEN = 'EAAN-whatsapp-token-0123456789abcdef-SECRETVALUE';
const FB_TOKEN = 'EAAN-page-token-0123456789abcdef-PAGESECRET';
const APP_SECRET = '0123456789abcdef0123456789abcdef';
const realFetch = global.fetch;

async function clean() {
  // Each test reuses the same numbers and Pages, and one belongs to one shop, so nothing may survive from the test before.
  await prisma.shopIntegration.deleteMany({});
  await prisma.platformIntegration.deleteMany({});
  await prisma.adminAuditLog.deleteMany({ where: { OR: [{ action: { startsWith: 'integration.' } }, { action: { startsWith: 'platform.integration' } }] } });
  service.invalidate();
}
beforeEach(clean);
afterEach(() => { global.fetch = realFetch; });
afterAll(async () => { await clean(); await cleanup(); await close(); });

const whatsapp = (id = '543573888841483', extra: Record<string, string> = {}) => ({ config: { phoneNumberId: id, ...extra }, secrets: { accessToken: WA_TOKEN } });

describe('secrets in the database and in what the owner sees', () => {
  it('are stored encrypted, and reading a connection back never returns a secret', async () => {
    const shop = await makeShop();
    const view = await service.save(shop.id, 'WHATSAPP', { enabled: true, ...whatsapp(), config: { phoneNumberId: '543573888841483', appId: '945563351753331' }, secrets: { accessToken: WA_TOKEN, appSecret: APP_SECRET } }, owner);

    const json = JSON.stringify(view);
    expect(json).not.toContain(WA_TOKEN);
    expect(json).not.toContain(APP_SECRET);
    const wa = view.connections.find((c) => c.provider === 'WHATSAPP')!;
    expect(wa.connected).toBe(true);
    expect(wa.fields.find((f) => f.key === 'accessToken')).toMatchObject({ set: true, hint: '••••sult'.replace('sult', WA_TOKEN.slice(-4)), value: null });
    expect(wa.fields.find((f) => f.key === 'phoneNumberId')).toMatchObject({ set: true, value: '543573888841483', hint: null });

    const row = await prisma.shopIntegration.findFirstOrThrow({ where: { shopId: shop.id, provider: 'WHATSAPP' } });
    expect(row.secrets).toMatch(/^enc:v1:/);
    expect(row.secrets).not.toContain(WA_TOKEN);
    expect(JSON.stringify(row.config)).not.toContain(WA_TOKEN);
    expect(row.externalId).toBe('543573888841483');
    expect(row.enabled).toBe(true);
  });

  it('a blank secret keeps what is stored; clearing is explicit; a changed id forgets the old connection check', async () => {
    const shop = await makeShop();
    await service.save(shop.id, 'WHATSAPP', { enabled: true, ...whatsapp(), secrets: { accessToken: WA_TOKEN, appSecret: APP_SECRET } }, owner);
    await prisma.shopIntegration.updateMany({ where: { shopId: shop.id }, data: { lastCheckedAt: new Date(), lastError: 'old error' } });

    await service.save(shop.id, 'WHATSAPP', { secrets: { accessToken: '', appSecret: '' }, config: { reportTemplate: 'daily_report_v2' } }, owner);
    let c = (await service.resolve(shop.id, 'WHATSAPP'))!;
    expect(c.secrets).toEqual({ accessToken: WA_TOKEN, appSecret: APP_SECRET });
    expect(c.config.reportTemplate).toBe('daily_report_v2');
    expect((await prisma.shopIntegration.findFirstOrThrow({ where: { shopId: shop.id } })).lastError).toBeNull(); // changed, so no longer "checked"

    await service.save(shop.id, 'WHATSAPP', { clear: ['appSecret'] }, owner);
    c = (await service.resolve(shop.id, 'WHATSAPP'))!;
    expect(c.secrets).toEqual({ accessToken: WA_TOKEN });
  });

  it('writes who changed what to the audit log by field NAME, and never a value', async () => {
    const shop = await makeShop();
    await service.save(shop.id, 'FACEBOOK', { enabled: true, config: { pageId: '405520572643076' }, secrets: { pageAccessToken: FB_TOKEN, appSecret: APP_SECRET } }, { ...owner, impersonatedBy: 'admin-1' });
    const rows = await prisma.adminAuditLog.findMany({ where: { shopId: shop.id, action: 'integration.updated' } });
    expect(rows).toHaveLength(1);
    const meta = rows[0].metadata as any;
    expect(meta).toMatchObject({ provider: 'FACEBOOK', by: 'owner@shop.test', impersonatedBy: 'admin-1', enabled: true });
    expect(meta.fields.sort()).toEqual(['appSecret', 'pageAccessToken', 'pageId']);
    const all = JSON.stringify(rows);
    for (const secret of [FB_TOKEN, APP_SECRET, '405520572643076']) expect(all).not.toContain(secret);
  });
});

describe('each shop has its own connections', () => {
  it('one shop never sees or uses another\'s, and one number or Page belongs to one shop', async () => {
    const a = await makeShop();
    const b = await makeShop();
    await service.save(a.id, 'WHATSAPP', { enabled: true, ...whatsapp('111111111111') }, owner);

    const bView = await service.list(b.id);
    expect(bView.connections.find((c) => c.provider === 'WHATSAPP')).toMatchObject({ connected: false, enabled: false });
    expect(JSON.stringify(bView)).not.toContain('111111111111');
    expect(await service.resolve(b.id, 'WHATSAPP')).toBeNull();
    expect((await service.resolve(a.id, 'WHATSAPP'))!.externalId).toBe('111111111111');

    await expect(service.save(b.id, 'WHATSAPP', { enabled: true, ...whatsapp('111111111111') }, owner)).rejects.toThrow(/already connected to another shop/);
    // The failed attempt left nothing behind for shop B.
    expect(await prisma.shopIntegration.count({ where: { shopId: b.id } })).toBe(0);
    await service.save(b.id, 'WHATSAPP', { enabled: true, ...whatsapp('222222222222') }, owner);
    expect((await service.resolve(b.id, 'WHATSAPP'))!.externalId).toBe('222222222222');
    expect((await service.resolve(a.id, 'WHATSAPP'))!.externalId).toBe('111111111111');
  });

  it('cannot be switched on until what it needs is filled in, and an invalid value is refused with a reason', async () => {
    const shop = await makeShop();
    await expect(service.save(shop.id, 'FACEBOOK', { enabled: true, config: { pageId: '405520572643076' } }, owner)).rejects.toThrow(/Page access token is filled in/);
    await expect(service.save(shop.id, 'WHATSAPP', { config: { phoneNumberId: 'not digits' } }, owner)).rejects.toThrow(/Phone number ID does not look right/);
    await service.save(shop.id, 'FACEBOOK', { config: { pageId: '405520572643076' } }, owner); // saving a draft is fine
    expect(await service.resolve(shop.id, 'FACEBOOK')).toBeNull(); // but a draft is not a connection
  });

  it('a connection that is saved but switched off is not used', async () => {
    const shop = await makeShop();
    await service.save(shop.id, 'WHATSAPP', { enabled: false, ...whatsapp('333333333333') }, owner);
    expect(await service.resolve(shop.id, 'WHATSAPP')).toBeNull();
    await service.save(shop.id, 'WHATSAPP', { enabled: true }, owner);
    expect((await service.resolve(shop.id, 'WHATSAPP'))!.source).toBe('shop'); // cache was dropped by the save
  });
});

describe('the platform sender stands in only for notices to the owner', () => {
  it('a shop without its own number may use it for owner notices, never for anything else; a shop\'s own number wins', async () => {
    const shop = await makeShop();
    await service.savePlatform({ enabled: true, config: { phoneNumberId: '999999999999', reportTemplate: 'daily_report' }, secrets: { accessToken: 'PLATFORM-token-0123456789abcdef' } }, { id: null, email: 'operator@platform.test' });

    expect(await service.resolve(shop.id, 'WHATSAPP')).toBeNull(); // what a customer would see: nothing
    const viaPlatform = (await service.resolve(shop.id, 'WHATSAPP', { allowPlatform: true }))!;
    expect(viaPlatform).toMatchObject({ source: 'platform', externalId: '999999999999' });
    expect(await service.resolve(shop.id, 'FACEBOOK', { allowPlatform: true })).toBeNull(); // only WhatsApp has a platform sender
    expect(await service.resolve(shop.id, 'THREADS', { allowPlatform: true })).toBeNull();

    const listed = await service.list(shop.id);
    expect(listed.connections.find((c) => c.provider === 'WHATSAPP')!.ownerNoticesVia).toBe('platform');
    expect(JSON.stringify(listed)).not.toContain('PLATFORM-token');

    await service.save(shop.id, 'WHATSAPP', { enabled: true, ...whatsapp('444444444444') }, owner);
    expect((await service.resolve(shop.id, 'WHATSAPP', { allowPlatform: true }))).toMatchObject({ source: 'shop', externalId: '444444444444' });
    expect((await service.list(shop.id)).connections.find((c) => c.provider === 'WHATSAPP')!.ownerNoticesVia).toBeNull();
  });

  it('the operator\'s view never returns the token, and the change is audited by field name', async () => {
    const view = await service.savePlatform({ enabled: true, config: { phoneNumberId: '999999999999' }, secrets: { accessToken: 'PLATFORM-token-0123456789abcdef' } }, { id: null, email: 'operator@platform.test' });
    expect(JSON.stringify(view)).not.toContain('PLATFORM-token');
    expect(view.fields.find((f) => f.key === 'accessToken')).toMatchObject({ set: true, hint: '••••cdef' });
    expect(view.fields.map((f) => f.key)).not.toContain('appSecret'); // the platform holds no Meta app
    const audit = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: 'platform.integration_updated' } });
    expect(JSON.stringify(audit.metadata)).not.toContain('PLATFORM-token');
    expect((audit.metadata as any).fields.sort()).toEqual(['accessToken', 'phoneNumberId']);
    await expect(service.savePlatform({ enabled: true, config: { phoneNumberId: '' }, clear: ['phoneNumberId'] }, owner)).rejects.toThrow(/cannot be switched on/);
  });
});

describe('the daily report sends from the connection the shop is entitled to', () => {
  const sent: Array<{ url: string; auth: string }> = [];
  const email = { sendDetailed: jest.fn(async () => ({ ok: true })) };
  const reports = new DailyReportService(prisma, email as any, new WhatsAppService(service), new MarketingSummaryService(prisma));

  beforeEach(() => {
    sent.length = 0;
    global.fetch = jest.fn(async (url: any, init: any) => { sent.push({ url: String(url), auth: init?.headers?.Authorization }); return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 }); }) as any;
  });

  const configure = async (shopId: string) =>
    prisma.dailyReportSetting.create({ data: { shopId, enabled: true, emailRecipients: [], whatsappRecipients: ['0722000111'], updatedBy: 'test' } });

  it('uses the operator\'s sender when the shop has none, its own number when it has one, and says why when there is neither', async () => {
    const shop = await makeShop();
    await configure(shop.id);

    let r = await reports.deliver(shop.id, '2026-11-04', { force: true });
    expect(r.whatsapp[0]).toMatchObject({ status: 'SKIPPED' });
    expect(r.whatsapp[0].error).toMatch(/Connect it in Portal > Connections/);
    expect(sent).toHaveLength(0);
    expect((await reports.getSettings(shop.id)).whatsappConfigured).toBe(false);

    await service.savePlatform({ enabled: true, config: { phoneNumberId: '999999999999' }, secrets: { accessToken: 'PLATFORM-token-0123456789abcdef' } }, { id: null, email: 'op@platform.test' });
    r = await reports.deliver(shop.id, '2026-11-04', { force: true });
    expect(r.whatsapp[0].status).toBe('SENT');
    expect(sent[0]).toEqual({ url: 'https://graph.facebook.com/v21.0/999999999999/messages', auth: 'Bearer PLATFORM-token-0123456789abcdef' });
    expect(await reports.getSettings(shop.id)).toMatchObject({ whatsappConfigured: true, whatsappSource: 'platform' });

    await service.save(shop.id, 'WHATSAPP', { enabled: true, ...whatsapp('444444444444') }, owner);
    r = await reports.deliver(shop.id, '2026-11-04', { force: true });
    expect(r.whatsapp[0].status).toBe('SENT');
    expect(sent[1].url).toBe('https://graph.facebook.com/v21.0/444444444444/messages');
    expect(sent[1].auth).toBe(`Bearer ${WA_TOKEN}`);
    expect(await reports.getSettings(shop.id)).toMatchObject({ whatsappSource: 'shop' });
  });

  it('is scheduled by the shop\'s own saved settings, not by a list on the server', async () => {
    const on = await makeShop();
    const off = await makeShop();
    const never = await makeShop();
    await configure(on.id);
    await prisma.dailyReportSetting.create({ data: { shopId: off.id, enabled: false, emailRecipients: [], whatsappRecipients: [], updatedBy: 'test' } });
    const deliver = jest.fn(async () => ({ email: [], whatsapp: [] }));
    const scheduler = new DailyReportScheduler(prisma, { deliver } as any);
    await scheduler.tick(new Date('2026-11-05T05:30:00Z')); // 08:30 in Nairobi
    const asked = deliver.mock.calls.map((c: any[]) => c[0]);
    expect(asked).toContain(on.id);
    expect(asked).not.toContain(off.id);
    expect(asked).not.toContain(never.id);
  });
});

describe('webhook addresses', () => {
  it('a secret is shown once, only its hash is kept, and it finds the right shop and provider and nothing else', async () => {
    const a = await makeShop();
    const b = await makeShop();
    await service.save(a.id, 'WHATSAPP', { enabled: true, ...whatsapp('555555555555') }, owner);
    await service.save(b.id, 'WHATSAPP', { enabled: true, ...whatsapp('666666666666') }, owner);
    await service.save(a.id, 'FACEBOOK', { config: { pageId: '405520572643076' } }, owner);

    const { secret } = await service.rotateWebhookSecret(a.id, 'WHATSAPP', owner);
    expect(secret).toMatch(/^[0-9a-f]{48}$/);
    const row = await prisma.shopIntegration.findFirstOrThrow({ where: { shopId: a.id, provider: 'WHATSAPP' } });
    expect(row.webhookKey).toMatch(/^[0-9a-f]{64}$/);
    expect(row.webhookKey).not.toContain(secret);

    expect(await service.findByWebhookSecret('WHATSAPP', secret)).toMatchObject({ shopId: a.id, externalId: '555555555555' });
    expect(await service.findByWebhookSecret('FACEBOOK', secret)).toBeNull(); // the right secret for the wrong provider
    expect(await service.findByWebhookSecret('WHATSAPP', 'x'.repeat(48))).toBeNull();
    expect(await service.findByWebhookSecret('WHATSAPP', '')).toBeNull();

    const second = await service.rotateWebhookSecret(a.id, 'WHATSAPP', owner);
    expect(await service.findByWebhookSecret('WHATSAPP', secret)).toBeNull(); // the old address stops working
    expect(await service.findByWebhookSecret('WHATSAPP', second.secret)).toMatchObject({ shopId: a.id });
    expect((await service.list(a.id)).connections.find((c) => c.provider === 'WHATSAPP')!.webhookConfigured).toBe(true);
    await expect(service.rotateWebhookSecret(b.id, 'THREADS', owner)).rejects.toThrow(/has not been set up/);
  });
});

describe('Test connection', () => {
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

  it('says in words what worked, records it, and reads only', async () => {
    const shop = await makeShop();
    await service.save(shop.id, 'WHATSAPP', { enabled: true, ...whatsapp('555555555555') }, owner);
    const calls: Array<{ url: string; method: string; auth: string }> = [];
    global.fetch = jest.fn(async (url: any, init: any) => { calls.push({ url: String(url), method: init?.method ?? 'GET', auth: init?.headers?.Authorization }); return json({ display_phone_number: '+254 113 206 481', verified_name: 'Drip Emporium', quality_rating: 'GREEN' }); }) as any;

    const result = await service.test(shop.id, 'WHATSAPP', owner);
    expect(result).toMatchObject({ ok: true, message: 'Connected to +254 113 206 481 (Drip Emporium).', details: { quality: 'GREEN' } });
    expect(JSON.stringify(result)).not.toContain(WA_TOKEN);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(calls[0].url).toContain('/555555555555?fields=');
    const row = await prisma.shopIntegration.findFirstOrThrow({ where: { shopId: shop.id } });
    expect(row.lastCheckedAt).not.toBeNull();
    expect(row.lastError).toBeNull();
  });

  it('shows Meta\'s own error and keeps it for the screen', async () => {
    const shop = await makeShop();
    await service.save(shop.id, 'WHATSAPP', { enabled: true, ...whatsapp('555555555555') }, owner);
    global.fetch = jest.fn(async () => json({ error: { code: 190, message: 'Error validating access token: Session has expired' } }, 401)) as any;
    const result = await service.test(shop.id, 'WHATSAPP', owner);
    expect(result).toMatchObject({ ok: false, message: '190: Error validating access token: Session has expired' });
    expect((await prisma.shopIntegration.findFirstOrThrow({ where: { shopId: shop.id } })).lastError).toContain('190');
    expect((await service.list(shop.id)).connections.find((c) => c.provider === 'WHATSAPP')!.lastError).toContain('Session has expired');
  });

  it('Facebook reports whether comments are reaching us; Threads finds the account id from the token', async () => {
    const shop = await makeShop();
    await service.save(shop.id, 'FACEBOOK', { enabled: true, config: { pageId: '405520572643076' }, secrets: { pageAccessToken: FB_TOKEN } }, owner);
    global.fetch = jest.fn(async (url: any) => String(url).includes('subscribed_apps')
      ? json({ data: [{ name: 'App', subscribed_fields: ['feed'] }] })
      : json({ name: 'Drip Emp', fan_count: 489 })) as any;
    expect(await service.test(shop.id, 'FACEBOOK', owner)).toMatchObject({ ok: true, details: { name: 'Drip Emp', followers: 489, commentsConnected: true } });

    await service.save(shop.id, 'THREADS', { enabled: true, secrets: { accessToken: 'THAA-threads-token-0123456789abcdef' } }, owner);
    global.fetch = jest.fn(async (url: any) => String(url).includes('threads_publishing_limit')
      ? json({ data: [{ quota_usage: 2, config: { quota_total: 250 } }] })
      : json({ id: '40242283428718911', username: 'dripemp' })) as any;
    const result = await service.test(shop.id, 'THREADS', owner);
    expect(result).toMatchObject({ ok: true, message: 'Connected to @dripemp.', details: { postsUsedToday: 2, postsAllowedPerDay: 250 } });
    const row = await prisma.shopIntegration.findFirstOrThrow({ where: { shopId: shop.id, provider: 'THREADS' } });
    expect(row.externalId).toBe('40242283428718911');
    expect((row.config as any).userId).toBe('40242283428718911');
    // The token went in the query string for Threads, and is not in anything we return or keep in the open.
    expect(JSON.stringify(result)).not.toContain('THAA-threads');
    expect(JSON.stringify(row.config)).not.toContain('THAA-threads');
  });

  it('refuses to test what is not filled in, or does not exist', async () => {
    const shop = await makeShop();
    await expect(service.test(shop.id, 'THREADS', owner)).rejects.toThrow(/has not been set up/);
    await service.save(shop.id, 'FACEBOOK', { config: { pageId: '405520572643076' } }, owner);
    await expect(service.test(shop.id, 'FACEBOOK', owner)).rejects.toThrow(/Fill in the required fields/);
  });
});

describe('moving the old environment values into the settings', () => {
  const keep = { id: process.env.WHATSAPP_PHONE_NUMBER_ID, token: process.env.WHATSAPP_ACCESS_TOKEN };
  afterEach(() => {
    if (keep.id === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID; else process.env.WHATSAPP_PHONE_NUMBER_ID = keep.id;
    if (keep.token === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN; else process.env.WHATSAPP_ACCESS_TOKEN = keep.token;
  });

  it('copies them once into the platform sender, so the daily report survives, and never overwrites what the operator saved', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '543573888841483';
    process.env.WHATSAPP_ACCESS_TOKEN = 'IMPORTED-token-0123456789abcdef';
    expect(await service.importFromEnvironment()).toBe(true);
    const view = await service.listPlatform();
    expect(view).toMatchObject({ enabled: true, connected: true, updatedBy: 'imported from the server environment' });
    expect(JSON.stringify(view)).not.toContain('IMPORTED-token');
    const shop = await makeShop();
    expect((await service.resolve(shop.id, 'WHATSAPP', { allowPlatform: true }))!.externalId).toBe('543573888841483');

    expect(await service.importFromEnvironment()).toBe(false); // nothing happens the second time
    await service.savePlatform({ config: { phoneNumberId: '777777777777' } }, { id: null, email: 'op@platform.test' });
    process.env.WHATSAPP_PHONE_NUMBER_ID = '888888888888';
    expect(await service.importFromEnvironment()).toBe(false); // the operator's saved value is never replaced by the environment
    expect((await service.listPlatform()).fields.find((f) => f.key === 'phoneNumberId')!.value).toBe('777777777777');
  });

  it('two backend slots starting together import it once, and the one that loses the race is quiet', async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = '543573888841483';
    process.env.WHATSAPP_ACCESS_TOKEN = 'IMPORTED-token-0123456789abcdef';
    const results = await Promise.all([service.importFromEnvironment(), new IntegrationsService(prisma).importFromEnvironment()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.platformIntegration.count()).toBe(1);
  });

  it('does nothing when the environment has no WhatsApp values', async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    expect(await service.importFromEnvironment()).toBe(false);
    expect(await prisma.platformIntegration.count()).toBe(0);
  });
});
