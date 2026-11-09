import { createHmac } from 'crypto';
import { NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { IntegrationsService } from '../../src/integrations/integrations.service';
import { FacebookCommentsService } from '../../src/facebook/facebook-comments.service';
import { FacebookConnectionService } from '../../src/facebook/facebook-connection.service';
import { FacebookWebhookController } from '../../src/facebook/facebook-webhook.controller';
import { cleanup, close, makeShop, prisma } from './helpers';

const integrations = new IntegrationsService(prisma);
const connections = new FacebookConnectionService(integrations, prisma);
const comments = new FacebookCommentsService(prisma, connections);
const webhook = new FacebookWebhookController(integrations, comments);
const owner = { id: null, email: 'owner@shop.test' };

const realFetch = global.fetch;
type Call = { method: string; path: string; auth: string; body: any };
let calls: Call[] = [];
/** What the fake Facebook answers, by path suffix. Each entry is used once, then it answers normally. */
let queue: Array<{ match: RegExp; status: number; data: any }> = [];
let seq = 0;
beforeEach(async () => {
  // Each test uses the same Pages, and one Page belongs to one shop, so nothing may survive from the test before.
  await prisma.shopIntegration.deleteMany({});
  calls = []; queue = []; seq = 0; integrations.invalidate();
  global.fetch = jest.fn(async (url: any, init: any) => {
    const u = String(url);
    const m = /graph\.facebook\.com\/v[\d.]+\/(.+)$/.exec(u);
    if (!m) return realFetch(url, init);
    const path = m[1];
    const call: Call = { method: init?.method ?? 'GET', path, auth: init?.headers?.Authorization, body: init?.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const i = queue.findIndex((q) => q.match.test(path));
    if (i >= 0) { const q = queue.splice(i, 1)[0]; return new Response(JSON.stringify(q.data), { status: q.status }); }
    if (/\/messages$/.test(path)) return new Response(JSON.stringify({ recipient_id: `PSID-${++seq}`, message_id: `m_${seq}` }), { status: 200 });
    if (/\/comments$/.test(path)) return new Response(JSON.stringify({ id: `${call.path.split('/')[0]}_reply_${++seq}` }), { status: 200 });
    if (/\/subscribed_apps/.test(path)) return new Response(JSON.stringify(call.method === 'GET' ? { data: [{ name: 'App', subscribed_fields: ['feed'] }] } : { success: true }), { status: 200 });
    return new Response(JSON.stringify({ error: { code: 100, message: 'unknown' } }), { status: 404 });
  }) as any;
});
afterEach(() => { global.fetch = realFetch; });
afterAll(async () => {
  await prisma.shopIntegration.deleteMany({}); await prisma.adminAuditLog.deleteMany({ where: { action: { startsWith: 'integration.' } } });
  await cleanup(); await close();
});

const PAGE_A = '405520572643076';
const PAGE_B = '405520572643077';
const privateCalls = () => calls.filter((c) => c.path.endsWith('/messages'));
const publicCalls = () => calls.filter((c) => c.path.endsWith('/comments'));

/** A shop with its own Page connected and "Reply to people who comment" switched on. */
async function pageShop(pageId = PAGE_A, config: Record<string, string> = {}, shopOver: Record<string, unknown> = {}) {
  const shop = await makeShop({ name: 'Nairobi Gents', whatsappNumber: '0113 206 481', address: 'Moi Avenue, Nairobi', ...shopOver });
  await integrations.save(shop.id, 'FACEBOOK', { enabled: true, config: { pageId, commentReplies: 'true', ...config }, secrets: { pageAccessToken: `PAGE-TOKEN-${pageId}-0123456789abcdef` } }, owner);
  return shop;
}

let cid = 0;
const feed = (pageId: string, over: any = {}) => ({
  commentId: `${pageId}_900_${++cid}`, postId: `${pageId}_900`, parentId: `${pageId}_900`, pageId, fromId: `U${cid}`, fromName: 'Wanjiru Kamau', message: 'How much is the Seiko 5?', createdAt: new Date(), ...over,
});

describe('someone comments on the shop\'s Page', () => {
  it('gets one private Messenger reply, then a public one, with the shop\'s own name and links, sent with that shop\'s own Page token', async () => {
    const shop = await pageShop();
    const c = feed(PAGE_A);
    expect(await comments.handleComment(shop.id, c)).toBe('SENT');
    expect(await comments.handleComment(shop.id, c)).toBe('DUPLICATE'); // Facebook delivers the same event twice now and then
    expect(calls.map((x) => x.path)).toEqual([`${PAGE_A}/messages`, `${c.commentId}/comments`]);

    const [priv, pub] = calls;
    expect(priv.auth).toBe(`Bearer PAGE-TOKEN-${PAGE_A}-0123456789abcdef`);
    expect(priv.body.recipient).toEqual({ comment_id: c.commentId });
    expect(priv.body.message.text).toMatch(/^Hi Wanjiru! 👋 Thanks for your interest in Nairobi Gents\./);
    expect(priv.body.message.text).toContain('https://wa.me/254113206481');
    expect(priv.body.message.text).toContain(`https://www.facebook.com/${PAGE_A}`);
    expect(pub.body.message).toContain('Shop online: https://');
    expect(pub.body.message).toContain('Visit us: Moi Avenue, Nairobi');

    const row = await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id } });
    expect([row.status, row.attempts, row.detail, row.recipientId]).toEqual(['SENT', 1, null, 'PSID-1']);
    expect(row.privateMessageId && row.publicReplyId && row.repliedAt).toBeTruthy();
  });

  it('does nothing while "Reply to people who comment" is off, which is how every shop starts, or when Facebook is not connected', async () => {
    const off = await pageShop(PAGE_A, { commentReplies: 'false' });
    expect(await comments.handleComment(off.id, feed(PAGE_A))).toBe('IGNORED');
    const bare = await makeShop();
    await integrations.save(bare.id, 'FACEBOOK', { enabled: true, config: { pageId: PAGE_B }, secrets: { pageAccessToken: 'PAGE-TOKEN-bare-0123456789abcdef' } }, owner); // nothing chosen: off too
    expect(await comments.handleComment(bare.id, feed(PAGE_B))).toBe('IGNORED');
    const none = await makeShop();
    expect(await comments.handleComment(none.id, feed(PAGE_A))).toBe('IGNORED');
    expect(calls).toHaveLength(0);
    expect(await prisma.facebookCommentReply.count({ where: { shopId: { in: [off.id, bare.id, none.id] } } })).toBe(0);
  });

  it('does not answer the Page\'s own comments, a comment on another Page, a reply to a comment, or a comment with a link; and a person is messaged once a week', async () => {
    const shop = await pageShop();
    expect(await comments.handleComment(shop.id, feed(PAGE_A, { fromId: PAGE_A }))).toBe('IGNORED'); // our own public reply must not start a loop
    expect(await comments.handleComment(shop.id, feed(PAGE_B))).toBe('IGNORED');
    expect(await comments.handleComment(shop.id, feed(PAGE_A, { parentId: `${PAGE_A}_900_other` }))).toBe('SKIPPED');
    expect(await comments.handleComment(shop.id, feed(PAGE_A, { message: 'win big https://scam.example/x' }))).toBe('SKIPPED');
    expect(await comments.handleComment(shop.id, feed(PAGE_A, { fromId: null }))).toBe('SKIPPED');
    expect(calls).toHaveLength(0);
    expect(await comments.handleComment(shop.id, feed(PAGE_A, { fromId: 'U-same' }))).toBe('SENT');
    expect(await comments.handleComment(shop.id, feed(PAGE_A, { fromId: 'U-same' }))).toBe('SKIPPED');
    expect((await prisma.facebookCommentReply.findFirst({ where: { shopId: shop.id, status: 'SKIPPED', detail: { contains: 'this week' } } }))).not.toBeNull();
    expect(privateCalls()).toHaveLength(1);
  });

  it('stops at the shop\'s own daily limit', async () => {
    const shop = await pageShop(PAGE_A, { replyDailyCap: '2' });
    expect(await comments.handleComment(shop.id, feed(PAGE_A))).toBe('SENT');
    expect(await comments.handleComment(shop.id, feed(PAGE_A))).toBe('SENT');
    expect(await comments.handleComment(shop.id, feed(PAGE_A))).toBe('SKIPPED');
    expect((await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id, status: 'SKIPPED' } })).detail).toBe('Daily limit of 2 reached');
    expect(privateCalls()).toHaveLength(2);
    expect((await comments.status(shop.id)).sentToday).toBe(2);
  });

  it('leaves out the lines a shop has no value for: no WhatsApp number or address means no empty "WhatsApp:" or "Visit us:"', async () => {
    const shop = await pageShop(PAGE_A, {}, { whatsappNumber: null, address: null });
    await comments.handleComment(shop.id, feed(PAGE_A));
    expect(privateCalls()[0].body.message.text).not.toMatch(/WhatsApp/);
    expect(privateCalls()[0].body.message.text).toContain('Follow our page');
    expect(publicCalls()[0].body.message).not.toMatch(/Visit us/);
  });

  it('uses the owner\'s own wording and Page link when set', async () => {
    const shop = await pageShop(PAGE_A, { privateReplyText: 'Karibu {name}! {shop} ni hapa: {page}', pageUrl: 'https://www.facebook.com/nairobigents', publicReplyText: 'Asante {name}, angalia inbox.' });
    await comments.handleComment(shop.id, feed(PAGE_A));
    expect(privateCalls()[0].body.message.text).toBe('Karibu Wanjiru! Nairobi Gents ni hapa: https://www.facebook.com/nairobigents');
    expect(publicCalls()[0].body.message).toBe('Asante Wanjiru, angalia inbox.');
  });
});

describe('the public reply', () => {
  it('can be switched off, and failing (a missing permission) never undoes the private message', async () => {
    const quiet = await pageShop(PAGE_A, { publicReply: 'false' });
    await comments.handleComment(quiet.id, feed(PAGE_A));
    expect(publicCalls()).toHaveLength(0);
    expect((await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: quiet.id } })).status).toBe('SENT');

    const shop = await pageShop(PAGE_B);
    queue = [{ match: /\/comments$/, status: 403, data: { error: { code: 200, message: 'Requires pages_manage_engagement' } } }];
    expect(await comments.handleComment(shop.id, feed(PAGE_B))).toBe('SENT');
    const row = await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id } });
    expect([row.status, row.publicReplyId]).toEqual(['SENT', null]);
    expect(row.detail).toBe('Private reply sent; the public reply failed: 200: Requires pages_manage_engagement');
  });

  it('is only made after the private one went', async () => {
    const shop = await pageShop();
    queue = [{ match: /\/messages$/, status: 400, data: { error: { code: 200, message: 'Permissions error' } } }];
    expect(await comments.handleComment(shop.id, feed(PAGE_A))).toBe('FAILED');
    expect(publicCalls()).toHaveLength(0);
    expect((await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id } })).detail).toBe('200: Permissions error');
  });
});

describe('when Facebook is unavailable', () => {
  const down = () => ({ match: /\/messages$/, status: 500, data: { error: { code: 2, message: 'Service temporarily unavailable' } } });

  it('the reply is tried again a few minutes later, up to three times, and an answer already sent is not sent twice', async () => {
    const shop = await pageShop();
    queue = [down()];
    expect(await comments.handleComment(shop.id, feed(PAGE_A))).toBe('RETRY');
    const row = await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id } });
    expect(await comments.retryDue(new Date(Date.now() + 60_000))).toBe(0); // too soon
    expect(await comments.retryDue(new Date(Date.now() + 10 * 60_000))).toBe(1);
    expect(await prisma.facebookCommentReply.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: 'SENT', attempts: 2 });

    queue = [down(), down(), down()];
    const c2 = feed(PAGE_A);
    expect(await comments.handleComment(shop.id, c2)).toBe('RETRY');
    await comments.retryDue(new Date(Date.now() + 10 * 60_000));
    expect((await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id, commentId: c2.commentId } })).status).toBe('RETRY');
    await comments.retryDue(new Date(Date.now() + 20 * 60_000));
    expect(await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id, commentId: c2.commentId } })).toMatchObject({ status: 'FAILED', attempts: 3 });

    queue = [{ match: /\/messages$/, status: 400, data: { error: { code: 10900, message: 'Already replied' } } }];
    const c3 = feed(PAGE_A);
    expect(await comments.handleComment(shop.id, c3)).toBe('SKIPPED');
    expect((await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id, commentId: c3.commentId } })).detail).toBe('Already answered privately');
  });

  it('a reply left half-sent by a stopped backend is picked up after ten minutes, and one whose shop switched replies off is dropped', async () => {
    const shop = await pageShop();
    await prisma.facebookCommentReply.create({ data: { shopId: shop.id, commentId: 'C-stuck', fromId: 'U-stuck', fromName: 'A B', status: 'PENDING' } });
    expect(await comments.retryDue(new Date(Date.now() + 2 * 60_000))).toBe(0);
    expect(await comments.retryDue(new Date(Date.now() + 12 * 60_000))).toBe(1);
    expect((await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id, commentId: 'C-stuck' } })).status).toBe('SENT');

    await prisma.facebookCommentReply.create({ data: { shopId: shop.id, commentId: 'C-late', fromId: 'U-late', fromName: 'C D', status: 'RETRY', attempts: 1 } });
    await integrations.save(shop.id, 'FACEBOOK', { config: { commentReplies: 'false' } }, owner);
    calls = [];
    await comments.retryDue(new Date(Date.now() + 12 * 60_000));
    expect(calls).toHaveLength(0);
    expect(await prisma.facebookCommentReply.findFirstOrThrow({ where: { shopId: shop.id, commentId: 'C-late' } })).toMatchObject({ status: 'SKIPPED' });
  });
});

describe('every shop has its own Page', () => {
  it('uses each shop\'s own token and Page, counts and limits per shop, and a person is a separate person on each Page', async () => {
    const a = await pageShop(PAGE_A, { replyDailyCap: '1' });
    const b = await pageShop(PAGE_B);
    expect(await comments.handleComment(a.id, feed(PAGE_A, { fromId: 'U-shared', commentId: 'SHARED_1' }))).toBe('SENT');
    expect(await comments.handleComment(a.id, feed(PAGE_A))).toBe('SKIPPED'); // A's own cap
    expect(await comments.handleComment(b.id, feed(PAGE_B, { fromId: 'U-shared', commentId: 'SHARED_1' }))).toBe('SENT'); // same person, same comment id, other shop: unaffected
    expect(privateCalls().map((c) => [c.path, c.auth])).toEqual([
      [`${PAGE_A}/messages`, `Bearer PAGE-TOKEN-${PAGE_A}-0123456789abcdef`],
      [`${PAGE_B}/messages`, `Bearer PAGE-TOKEN-${PAGE_B}-0123456789abcdef`],
    ]);
    expect((await comments.list(a.id, {})).total).toBe(2);
    expect((await comments.list(b.id, {})).total).toBe(1);
    expect((await comments.status(b.id))).toMatchObject({ sent: 1, skipped: 0, dailyCap: 200 });
    expect((await comments.status(a.id))).toMatchObject({ sent: 1, skipped: 1, dailyCap: 1 });
  });

  it('shows whether Facebook is sending the shop its comments, in words', async () => {
    const shop = await pageShop();
    expect(await comments.status(shop.id)).toMatchObject({ connected: true, enabled: true, subscribed: true, pageId: PAGE_A });
    queue = [{ match: /subscribed_apps/, status: 200, data: { data: [] } }];
    expect((await comments.status(shop.id)).subscribed).toBe(false);
    queue = [{ match: /subscribed_apps/, status: 400, data: { error: { code: 190, message: 'Token has expired' } } }];
    expect((await comments.status(shop.id)).subscriptionError).toBe('190: Token has expired');
    expect(await comments.status((await makeShop()).id)).toMatchObject({ connected: false, enabled: false, subscribed: false });
  });
});

describe('the webhook address', () => {
  const event = (pageId: string, c: any = {}) => ({ object: 'page', entry: [{ id: pageId, time: 1793900000, changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: `${pageId}_900_${++cid}`, post_id: `${pageId}_900`, parent_id: `${pageId}_900`, created_time: 1793900000, message: 'How much?', from: { id: `W${cid}`, name: 'Brian Otieno' }, ...c } }] }] });

  it('only a real shop\'s secret works, and a wrong one looks like no endpoint at all', async () => {
    const shop = await pageShop();
    const { secret } = await integrations.rotateWebhookSecret(shop.id, 'FACEBOOK', owner);
    expect(await webhook.verify(secret, 'subscribe', secret, '4242')).toBe('4242');
    await expect(webhook.verify('x'.repeat(48), 'subscribe', 'x'.repeat(48), '1')).rejects.toThrow(NotFoundException);
    await expect(webhook.verify(secret, 'subscribe', 'wrong-token', '1')).rejects.toThrow(UnauthorizedException);
    await expect(webhook.receive('x'.repeat(48), event(PAGE_A), { headers: {} })).rejects.toThrow(NotFoundException);
    // A WhatsApp secret is not a Facebook secret.
    await integrations.save(shop.id, 'WHATSAPP', { config: { phoneNumberId: '111111111111111' }, secrets: { accessToken: 'TOKEN-wa-0123456789abcdef' } }, owner);
    const wa = await integrations.rotateWebhookSecret(shop.id, 'WHATSAPP', owner);
    await expect(webhook.receive(wa.secret, event(PAGE_A), { headers: {} })).rejects.toThrow(NotFoundException);
  });

  it('gives a comment to the shop whose address it arrived at, and ignores one on another Page', async () => {
    const a = await pageShop(PAGE_A);
    const b = await pageShop(PAGE_B);
    const sa = (await integrations.rotateWebhookSecret(a.id, 'FACEBOOK', owner)).secret;
    expect(await webhook.receive(sa, event(PAGE_A), { headers: {} })).toEqual({ received: true });
    expect(await prisma.facebookCommentReply.count({ where: { shopId: a.id } })).toBe(1);
    expect(await prisma.facebookCommentReply.count({ where: { shopId: b.id } })).toBe(0);
    calls = [];
    await webhook.receive(sa, event(PAGE_B), { headers: {} }); // B's Page, A's address
    expect(await prisma.facebookCommentReply.count({ where: { shopId: { in: [a.id, b.id] }, pageId: PAGE_B } })).toBe(0); // neither shop took it
    expect(await prisma.facebookCommentReply.count({ where: { shopId: b.id } })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('checks Facebook\'s signature with that shop\'s own app secret, and still answers 200 when one comment is bad', async () => {
    const shop = await pageShop();
    await integrations.save(shop.id, 'FACEBOOK', { secrets: { appSecret: '0123456789abcdef0123456789abcdef' } }, owner);
    const { secret } = await integrations.rotateWebhookSecret(shop.id, 'FACEBOOK', owner);
    const body = event(PAGE_A);
    const raw = Buffer.from(JSON.stringify(body));
    await expect(webhook.receive(secret, body, { headers: {}, rawBody: raw })).rejects.toThrow(UnauthorizedException);
    const sig = `sha256=${createHmac('sha256', '0123456789abcdef0123456789abcdef').update(raw).digest('hex')}`;
    expect(await webhook.receive(secret, body, { headers: { 'x-hub-signature-256': sig }, rawBody: raw })).toEqual({ received: true });
    expect(await prisma.facebookCommentReply.count({ where: { shopId: shop.id } })).toBe(1);
    const broken = { object: 'page', entry: [{ id: PAGE_A, changes: [{ field: 'feed', value: null }, { field: 'feed', value: { item: 'comment', verb: 'add' } }] }] };
    const rawBroken = Buffer.from(JSON.stringify(broken));
    const sigBroken = `sha256=${createHmac('sha256', '0123456789abcdef0123456789abcdef').update(rawBroken).digest('hex')}`;
    expect(await webhook.receive(secret, broken, { headers: { 'x-hub-signature-256': sigBroken }, rawBody: rawBroken })).toEqual({ received: true });
  });
});

describe('Connect comments', () => {
  it('subscribes the Page to the shop\'s app with its own Page token and gives back the address to paste into the Meta app, once', async () => {
    const shop = await pageShop();
    process.env.PUBLIC_API_BASE_URL = 'https://api.shops.test/';
    try {
      const result = await integrations.connectFacebookWebhook(shop.id, owner);
      expect(result).toMatchObject({ ok: true, subscribedPage: true });
      expect(result.url).toBe(`https://api.shops.test/facebook/webhook/${result.verifyToken}`);
      expect(result.message).toContain('Your Page is subscribed to your app.');
      expect(result.message).toMatch(/Webhooks, choose Page.*“feed”/);
      const sub = calls.find((c) => c.method === 'POST' && c.path.includes('subscribed_apps'))!;
      expect(sub.path).toBe(`${PAGE_A}/subscribed_apps?subscribed_fields=feed`);
      expect(sub.auth).toBe(`Bearer PAGE-TOKEN-${PAGE_A}-0123456789abcdef`);
      expect(await integrations.findByWebhookSecret('FACEBOOK', result.verifyToken)).toMatchObject({ shopId: shop.id, externalId: PAGE_A });

      queue = [{ match: /subscribed_apps/, status: 400, data: { error: { code: 200, message: 'Requires pages_manage_metadata' } } }];
      const refused = await integrations.connectFacebookWebhook(shop.id, owner);
      expect(refused).toMatchObject({ ok: false, subscribedPage: false });
      expect(refused.message).toContain('200: Requires pages_manage_metadata');
      expect(refused.url).toContain('/facebook/webhook/');
    } finally { delete process.env.PUBLIC_API_BASE_URL; }
  });

  it('needs the Page id and token first, and Threads has nothing to connect', async () => {
    const shop = await makeShop();
    await expect(integrations.connectFacebookWebhook(shop.id, owner)).rejects.toThrow(NotFoundException);
    await integrations.save(shop.id, 'FACEBOOK', { config: { pageId: PAGE_A } }, owner);
    await expect(integrations.connectFacebookWebhook(shop.id, owner)).rejects.toThrow(BadRequestException);
  });
});
