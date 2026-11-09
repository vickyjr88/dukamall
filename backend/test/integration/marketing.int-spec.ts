import { DailyReportService } from '../../src/daily-report/daily-report.service';
import { WhatsAppService } from '../../src/daily-report/whatsapp.service';
import { PlatformHealthService } from '../../src/admin/platform-health.service';
import { IntegrationsService } from '../../src/integrations/integrations.service';
import { MarketingSummaryService } from '../../src/marketing/marketing-summary.service';
import { cleanup, close, makeShop, prisma } from './helpers';

const integrations = new IntegrationsService(prisma);
const summary = new MarketingSummaryService(prisma);
const actor = { id: null, email: 'owner@shop.test' } as any;

const NOW = new Date('2026-11-09T07:00:00Z');
const HOUR = 3_600_000;
const period = { start: new Date(NOW.getTime() - 24 * HOUR), end: NOW };
const inside = new Date(NOW.getTime() - 5 * HOUR);
const before = new Date(NOW.getTime() - 30 * HOUR);

let uid = 0;
const tag = () => `${Date.now().toString(36)}${(uid += 1)}`.replace(/\D/g, '').padEnd(10, '7').slice(0, 14);

beforeEach(async () => { await prisma.shopIntegration.deleteMany({}); integrations.invalidate(); });
afterAll(async () => {
  await prisma.shopIntegration.deleteMany({}); await prisma.adminAuditLog.deleteMany({ where: { action: { startsWith: 'integration.' } } });
  await cleanup(); await close();
});

async function connect(shopId: string, what: Array<'WHATSAPP' | 'FACEBOOK' | 'THREADS'>, config: Record<string, Record<string, string>> = {}) {
  const t = tag();
  for (const provider of what) {
    const base = provider === 'WHATSAPP' ? { config: { phoneNumberId: `1${t}`, ...config.WHATSAPP }, secrets: { accessToken: `WA-SECRET-${t}-0123456789abcdef` } }
      : provider === 'FACEBOOK' ? { config: { pageId: `2${t}`, ...config.FACEBOOK }, secrets: { pageAccessToken: `PAGE-SECRET-${t}-0123456789abcdef` } }
      : { config: { userId: `3${t}`, ...config.THREADS }, secrets: { accessToken: `THREADS-SECRET-${t}-0123456789abcdef` } };
    await integrations.save(shopId, provider, { enabled: true, ...base }, actor);
  }
}

const send = (shopId: string, over: Record<string, unknown>) =>
  prisma.whatsappOutreach.create({ data: { shopId, phone: '254700000001', kind: 'GROUP', template: 'join_group', status: 'SENT', triggeredBy: 'test', createdAt: inside, ...over } as any });

describe('what a shop did in the period', () => {
  it('counts only the period, and counts a message Meta accepted and later reported as failed as failed', async () => {
    const shop = await makeShop();
    await connect(shop.id, ['WHATSAPP']);
    await send(shop.id, { delivery: 'delivered' });
    await send(shop.id, { delivery: 'read' });
    await send(shop.id, { delivery: null });
    await send(shop.id, { delivery: 'failed', deliveryError: '131042: payment' });
    await send(shop.id, { status: 'FAILED', error: 'Not on WhatsApp' });
    await send(shop.id, { status: 'SKIPPED' });
    await send(shop.id, { createdAt: before, delivery: 'delivered' });
    const m = await summary.forShop(shop.id, period, NOW);
    expect(m.whatsappActivity).toMatchObject({ sent: 3, failed: 2, delivered: 2 });
    expect(m.whatsappActivity.topFailure).toMatch(/131042|Not on WhatsApp/);
  });

  it('counts new people and opt-outs by when they happened', async () => {
    const shop = await makeShop();
    const c = (phone: string, over: Record<string, unknown>) => prisma.whatsappContact.create({ data: { shopId: shop.id, phone, createdAt: inside, ...over } as any });
    await c('254700000011', {});
    await c('254700000012', { unsubscribedAt: inside, unsubscribedReason: 'STOP', subscribed: false });
    await c('254700000013', { createdAt: before, unsubscribedAt: before, unsubscribedReason: 'STOP', subscribed: false });
    await c('254700000014', { unsubscribedAt: inside, unsubscribedReason: 'TRADE', subscribed: false });
    const m = await summary.forShop(shop.id, period, NOW);
    expect(m.whatsappActivity).toMatchObject({ newPeople: 3, optOuts: 1 });
  });

  it('counts Page comments, posts per channel, and the day’s Status pictures', async () => {
    const shop = await makeShop();
    const reply = (n: number, status: string, detail?: string) => prisma.facebookCommentReply.create({ data: { shopId: shop.id, commentId: `c-${tag()}-${n}`, status, detail, createdAt: inside } });
    await reply(1, 'SENT'); await reply(2, 'SENT'); await reply(3, 'FAILED', 'Missing pages_manage_engagement'); await reply(4, 'SKIPPED');
    const post = (slot: string, channel: string, status: string, detail?: string, createdAt = inside) => prisma.socialPost.create({ data: { shopId: shop.id, channel, slotKey: slot, status, detail, createdAt } });
    await post('a1', 'FACEBOOK', 'POSTED'); await post('a2', 'FACEBOOK', 'FAILED', 'Meta refused the picture'); await post('a3', 'THREADS', 'POSTED');
    await post('2026-11-08#1', 'STATUS', 'POSTED'); await post('2026-11-08#2', 'STATUS', 'READY'); await post('2026-11-07#1', 'STATUS', 'POSTED');
    await post('old', 'FACEBOOK', 'POSTED', undefined, before);
    const m = await summary.forShop(shop.id, { ...period, dayKey: '2026-11-08' }, NOW);
    expect(m.comments).toEqual({ sent: 2, failed: 1, skipped: 1, topFailure: 'Missing pages_manage_engagement' });
    expect(m.posts.facebook).toEqual({ posted: 1, failed: 1, topFailure: 'Meta refused the picture' });
    expect(m.posts.threads.posted).toBe(1);
    expect(m.status).toEqual({ prepared: 2, posted: 1 });
  });

  it('reads which features are on from the shop’s own settings', async () => {
    const shop = await makeShop();
    await connect(shop.id, ['WHATSAPP', 'FACEBOOK'], { WHATSAPP: { autoSubscribe: 'true' }, FACEBOOK: { commentReplies: 'true' } });
    await prisma.socialSetting.create({ data: { shopId: shop.id, facebookEnabled: true, threadsEnabled: false } });
    const m = await summary.forShop(shop.id, period, NOW);
    expect(m.features).toEqual({ welcomeSeries: true, commentReplies: true, postFacebook: true, postThreads: false });
    expect(m.used).toBe(true);
  });

  it('a shop that uses none of it is not "used"', async () => {
    const shop = await makeShop();
    const m = await summary.forShop(shop.id, period, NOW);
    expect(m.used).toBe(false);
    expect(m.attention).toEqual([]);
  });

  it('puts what needs a person into words, from the stored state', async () => {
    const shop = await makeShop();
    await connect(shop.id, ['THREADS']);
    await prisma.shopIntegration.updateMany({ where: { shopId: shop.id, provider: 'THREADS' }, data: { tokenExpiresAt: new Date(NOW.getTime() + 5 * 86_400_000), lastCheckedAt: NOW } });
    await prisma.socialSetting.create({ data: { shopId: shop.id, threadsEnabled: true } });
    const m = await summary.forShop(shop.id, period, NOW);
    expect(m.attention.map((a) => a.key)).toEqual(['threads-expiring']);
  });
});

describe('every shop’s numbers are its own', () => {
  it('two shops asked about at once do not see each other’s rows', async () => {
    const a = await makeShop(); const b = await makeShop();
    await send(a.id, {}); await send(a.id, {}); await send(b.id, { status: 'FAILED', error: 'x' });
    const both = await summary.forShops([a.id, b.id], period, NOW);
    expect(both.get(a.id)!.whatsappActivity).toMatchObject({ sent: 2, failed: 0 });
    expect(both.get(b.id)!.whatsappActivity).toMatchObject({ sent: 0, failed: 1 });
  });
  it('asking about no shops asks the database nothing', async () => {
    expect((await summary.forShops([], period, NOW)).size).toBe(0);
  });
});

describe('the operator’s view across shops', () => {
  it('lists only shops with a connection, worst first, with totals, and never a secret', async () => {
    const quiet = await makeShop({ name: 'Zeta Quiet' }); const bad = await makeShop({ name: 'Alpha Bad' }); const warn = await makeShop({ name: 'Mid Warn' }); await makeShop({ name: 'No Connections' });
    await connect(quiet.id, ['FACEBOOK']);
    await prisma.shopIntegration.updateMany({ where: { shopId: quiet.id }, data: { lastCheckedAt: NOW } });
    await connect(bad.id, ['WHATSAPP']);
    await prisma.shopIntegration.updateMany({ where: { shopId: bad.id }, data: { lastError: 'Invalid OAuth access token', lastCheckedAt: NOW } });
    await connect(warn.id, ['THREADS']); // never tested: a warning
    await send(bad.id, {}); await send(quiet.id, {});
    const o = await summary.overview(1, new Date());
    const mine = o.rows.filter((r) => [quiet.id, bad.id, warn.id].includes(r.shop.id));
    expect(mine.map((r) => r.shop.name)).toEqual(['Alpha Bad', 'Mid Warn', 'Zeta Quiet']);
    expect(o.rows.some((r) => r.shop.name === 'No Connections')).toBe(false);
    expect(o.totals.withProblems).toBeGreaterThanOrEqual(1);
    expect(o.totals.withConnections).toBe(o.rows.length);
    expect(o.totals.shops).toBeGreaterThan(o.rows.length);
    const text = JSON.stringify(o);
    expect(text).not.toMatch(/SECRET/);
    expect(text).not.toContain('secrets');
    expect(text).not.toContain('accessToken');
    expect(text).not.toContain('webhookKey');
  });
  it('a week reaches further back than a day', async () => {
    const shop = await makeShop();
    await connect(shop.id, ['WHATSAPP']);
    await send(shop.id, { createdAt: new Date(Date.now() - 3 * 86_400_000) });
    const find = (o: Awaited<ReturnType<typeof summary.overview>>) => o.rows.find((r) => r.shop.id === shop.id)!;
    expect(find(await summary.overview(1)).whatsappActivity.sent).toBe(0);
    expect(find(await summary.overview(7)).whatsappActivity.sent).toBe(1);
  });
  it('shows on the platform Health page as a warning that points at the detail, never as a failure', async () => {
    const health = new PlatformHealthService(prisma, {} as any, {} as any, summary);
    const bad = await makeShop();
    await connect(bad.id, ['FACEBOOK']);
    await prisma.shopIntegration.updateMany({ where: { shopId: bad.id }, data: { lastError: 'Invalid token', lastCheckedAt: new Date() } });
    const check = await (health as any).messaging();
    expect(check).toMatchObject({ key: 'messaging', status: 'warn' });
    expect(check.summary).toMatch(/messaging or posting problem/);
    await prisma.shopIntegration.updateMany({ where: { shopId: bad.id }, data: { lastError: null } });
    expect((await (health as any).messaging()).status).toBe('ok');
  });
});

describe('the owner’s daily report', () => {
  const reports = new DailyReportService(prisma, { sendDetailed: jest.fn(async () => ({ ok: true })) } as any, new WhatsAppService(integrations), summary);
  it('carries the day’s messaging for a shop that uses it, and nothing for one that does not', async () => {
    const used = await makeShop(); const unused = await makeShop();
    await connect(used.id, ['WHATSAPP']);
    await prisma.shopIntegration.updateMany({ where: { shopId: used.id }, data: { lastError: 'Invalid OAuth access token' } });
    // 2026-11-08 in Nairobi is 2026-11-07T21:00Z to 2026-11-08T21:00Z
    await send(used.id, { createdAt: new Date('2026-11-08T08:00:00Z'), delivery: 'delivered' });
    await send(used.id, { createdAt: new Date('2026-11-09T08:00:00Z') });
    const withMessaging = await reports.build(used.id, '2026-11-08', NOW);
    expect(withMessaging.messaging?.whatsappActivity.sent).toBe(1);
    expect(withMessaging.messaging?.attention.map((a) => a.key)).toEqual(['whatsapp-error']);
    expect((await reports.build(unused.id, '2026-11-08', NOW)).messaging).toBeNull();
    const email = (await reports.preview(used.id, '2026-11-08')).email.html;
    expect(email).toContain('Messaging and posting');
    expect(email).toContain('Invalid OAuth access token');
    expect(email).not.toMatch(/SECRET/);
  });
});
