import { MarketingSummaryService } from '../../src/marketing/marketing-summary.service';
import { createHmac } from 'crypto';
import { NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { DailyReportService } from '../../src/daily-report/daily-report.service';
import { WhatsAppService } from '../../src/daily-report/whatsapp.service';
import { IntegrationsService } from '../../src/integrations/integrations.service';
import { PortalCustomerService } from '../../src/portal-customer/portal-customer.service';
import { WhatsappConnectionService } from '../../src/whatsapp/whatsapp-connection.service';
import { WhatsappContactsService } from '../../src/whatsapp/whatsapp-contacts.service';
import { WhatsappOutreachService } from '../../src/whatsapp/whatsapp-outreach.service';
import { WhatsappSequenceService } from '../../src/whatsapp/whatsapp-sequence.service';
import { WhatsappWebhookController } from '../../src/whatsapp/whatsapp-webhook.controller';
import { noticeText } from '../../src/whatsapp/whatsapp-subscription';
import { cleanup, close, makeShop, prisma } from './helpers';

const integrations = new IntegrationsService(prisma);
const connections = new WhatsappConnectionService(integrations, prisma);
const contacts = new WhatsappContactsService(prisma, connections);
const customers = new PortalCustomerService(prisma);
const outreach = new WhatsappOutreachService(prisma, connections, customers);
outreach.pauseMs = 0;
const sequence = new WhatsappSequenceService(prisma, connections, outreach);
const webhook = new WhatsappWebhookController(integrations, contacts);
const owner = { id: null, email: 'owner@shop.test' };

const realFetch = global.fetch;
type Sent = { to: string; type: string; body?: string; template?: string; params?: string[]; phoneNumberId: string; auth: string };
let sent: Sent[] = [];
let failNext: Array<{ status: number; error: any }> = [];
let counter = 0;
beforeEach(async () => {
  // Each test uses the same numbers, and one number belongs to one shop, so nothing may survive from the test before.
  await prisma.shopIntegration.deleteMany({});
  sent = []; failNext = []; counter = 0; integrations.invalidate();
  global.fetch = jest.fn(async (url: any, init: any) => {
    const u = String(url);
    const m = /graph\.facebook\.com\/v[\d.]+\/(\d+)\/messages$/.exec(u);
    if (!m) return realFetch(url, init);
    const body = JSON.parse(init.body);
    sent.push({ to: body.to, type: body.type, body: body.text?.body, template: body.template?.name, params: body.template?.components?.[0]?.parameters?.map((p: any) => p.text), phoneNumberId: m[1], auth: init.headers.Authorization });
    const fail = failNext.shift();
    if (fail) return new Response(JSON.stringify({ error: fail.error }), { status: fail.status });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.OUT${++counter}` }] }), { status: 200 });
  }) as any;
});
afterEach(() => { global.fetch = realFetch; });
afterAll(async () => {
  await prisma.shopIntegration.deleteMany({}); await prisma.platformIntegration.deleteMany({}); await prisma.adminAuditLog.deleteMany({ where: { action: { startsWith: 'integration.' } } });
  await cleanup(); await close();
});

const PHONE_ID_A = '111111111111111';
const PHONE_ID_B = '222222222222222';

/** A shop with its own WhatsApp connection switched on, a group link and a review link. */
async function connectedShop(phoneNumberId = PHONE_ID_A, over: Record<string, string> = {}, shopOver: Record<string, unknown> = {}) {
  const shop = await makeShop({ name: 'Nairobi Gents', whatsappGroupUrl: 'https://chat.whatsapp.com/GROUP', googleReviewsUrl: 'https://g.page/r/REVIEW', ...shopOver });
  await integrations.save(shop.id, 'WHATSAPP', { enabled: true, config: { phoneNumberId, autoSubscribe: 'true', ...over }, secrets: { accessToken: `TOKEN-${phoneNumberId}-0123456789abcdef` } }, owner);
  return shop;
}

const inbound = (from: string, text: string, extra: any = {}) => ({ id: `wamid.IN${Math.random()}`, from, name: 'Wanjiru K', type: 'text', text, referral: null, timestamp: null, phoneNumberId: null, ...extra });
const sentTo = (phone: string) => sent.filter((s) => s.to === phone);

describe('someone messages the shop', () => {
  it('is welcomed once with the shop\'s name and the way to stop, however many times Meta delivers it, from the shop\'s own number', async () => {
    const shop = await connectedShop();
    const phone = '254712345001';
    const referral = { sourceId: '1203', headline: 'Seiko 5', clickId: 'abc' };
    expect(await contacts.handleMessage(shop.id, inbound(phone, 'Hi is it available?', { referral }))).toBe('SUBSCRIBED');
    expect(await contacts.handleMessage(shop.id, inbound(phone, 'Hello?'))).toBe('SEEN');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: phone, type: 'text', body: noticeText('Nairobi Gents'), phoneNumberId: PHONE_ID_A });
    expect(sent[0].auth).toContain(`TOKEN-${PHONE_ID_A}`);
    const c = await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone } });
    expect([c.subscribed, c.name, c.adSourceId, c.adHeadline, c.nextStep]).toEqual([true, 'Wanjiru K', '1203', 'Seiko 5', 0]);
    expect(c.noticeSentAt).not.toBeNull();
    const due = c.nextStepAt!.getTime() - Date.now();
    expect(due > 23 * 3_600_000 && due <= 24 * 3_600_000 + 1000).toBe(true);
  });

  it('two deliveries of the first message at the same moment make one contact and send one notice', async () => {
    const shop = await connectedShop();
    const phone = '254712345002';
    const results = await Promise.all([contacts.handleMessage(shop.id, inbound(phone, 'Hi')), contacts.handleMessage(shop.id, inbound(phone, 'Hi'))]);
    expect(results.sort()).toEqual(['SEEN', 'SUBSCRIBED']);
    expect(await prisma.whatsappContact.count({ where: { shopId: shop.id, phone } })).toBe(1);
    expect(sentTo(phone)).toHaveLength(1);
  });

  it('is only recorded and told nothing while "Welcome people who message you" is off, which is how every shop starts', async () => {
    const shop = await connectedShop(PHONE_ID_A, { autoSubscribe: 'false' });
    expect(await contacts.handleMessage(shop.id, inbound('254712345003', 'Hi'))).toBe('IGNORED');
    expect(await prisma.whatsappContact.count({ where: { shopId: shop.id } })).toBe(0);
    expect(sent).toHaveLength(0);
    // The default, with nothing chosen, is off too.
    const plain = await makeShop();
    await integrations.save(plain.id, 'WHATSAPP', { enabled: true, config: { phoneNumberId: PHONE_ID_B }, secrets: { accessToken: 'TOKEN-plain-0123456789abcdef' } }, owner);
    expect(await contacts.handleMessage(plain.id, inbound('254712345003', 'Hi'))).toBe('IGNORED');
  });

  it('STOP unsubscribes at once, is confirmed, and works even with the welcome series off; START brings them back (when it is on)', async () => {
    const shop = await connectedShop();
    const phone = '254712345004';
    await contacts.handleMessage(shop.id, inbound(phone, 'Hi'));
    sent = [];
    expect(await contacts.handleMessage(shop.id, inbound(phone, 'STOP'))).toBe('STOPPED');
    expect(sent[0].body).toMatch(/unsubscribed/);
    let c = await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone } });
    expect([c.subscribed, c.unsubscribedReason, c.nextStepAt]).toEqual([false, 'STOP', null]);

    sent = [];
    await contacts.handleMessage(shop.id, inbound(phone, 'Is the Seiko still there?')); // writing again does not resubscribe
    expect(sent).toHaveLength(0);
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone } })).subscribed).toBe(false);

    expect(await contacts.handleMessage(shop.id, inbound(phone, 'START'))).toBe('RESUBSCRIBED');
    c = await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone } });
    expect([c.subscribed, c.unsubscribedReason]).toEqual([true, null]);

    const quiet = await connectedShop(PHONE_ID_B, { autoSubscribe: 'false' });
    expect(await contacts.handleMessage(quiet.id, inbound(phone, 'stop'))).toBe('STOPPED');
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: quiet.id, phone } })).subscribed).toBe(false);
    expect(await contacts.handleMessage(quiet.id, inbound(phone, 'start'))).toBe('IGNORED');
  });

  it('a notice that could not be sent is retried when they write again, inside the window that opens', async () => {
    const shop = await connectedShop();
    const phone = '254712345005';
    failNext = [{ status: 400, error: { code: 131047, message: 'Re-engagement message' } }];
    await contacts.handleMessage(shop.id, inbound(phone, 'Hi'));
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone } })).noticeSentAt).toBeNull();
    await contacts.handleMessage(shop.id, inbound(phone, 'Hello again'));
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone } })).noticeSentAt).not.toBeNull();
    expect(sentTo(phone)).toHaveLength(2);
  });

  it('two shops never see each other\'s contacts, even for the same person', async () => {
    const a = await connectedShop(PHONE_ID_A);
    const b = await connectedShop(PHONE_ID_B);
    const phone = '254712345006';
    await contacts.handleMessage(a.id, inbound(phone, 'Hi'));
    await contacts.handleMessage(b.id, inbound(phone, 'STOP'));
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: a.id, phone } })).subscribed).toBe(true);
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: b.id, phone } })).subscribed).toBe(false);
    expect((await contacts.list(a.id, {})).total).toBe(1);
    expect((await contacts.stats(b.id)).stopped).toBe(1);
    expect((await contacts.stats(a.id)).stopped).toBe(0);
    const aContact = await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: a.id, phone } });
    await expect(contacts.unsubscribe(b.id, aContact.id)).rejects.toThrow(NotFoundException);
    expect(await outreach.repliedStop(a.id, phone)).toBe(false);
    expect(await outreach.repliedStop(b.id, phone)).toBe(true);
  });
});

describe('the webhook address', () => {
  const eventFor = (phoneNumberId: string, from: string, text: string, extra: any = {}) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ wa_id: from, profile: { name: 'Wanjiru' } }], messages: [{ id: `wamid.${Math.random()}`, from, type: 'text', timestamp: '1793900000', text: { body: text } }], ...extra } }] }],
  });

  it('answers Meta\'s check only for a real shop\'s secret, and a wrong secret looks like no endpoint at all', async () => {
    const shop = await connectedShop();
    const { secret } = await integrations.rotateWebhookSecret(shop.id, 'WHATSAPP', owner);
    expect(await webhook.verify(secret, 'subscribe', secret, '4242')).toBe('4242');
    await expect(webhook.verify('x'.repeat(48), 'subscribe', 'x'.repeat(48), '4242')).rejects.toThrow(NotFoundException);
    await expect(webhook.verify(secret, 'subscribe', 'not-the-token', '4242')).rejects.toThrow(UnauthorizedException);
    await expect(webhook.receive('x'.repeat(48), eventFor(PHONE_ID_A, '254712345010', 'Hi'), { headers: {} })).rejects.toThrow(NotFoundException);
  });

  it('gives each event to the shop whose address it arrived at, and ignores one meant for another number', async () => {
    const a = await connectedShop(PHONE_ID_A);
    const b = await connectedShop(PHONE_ID_B);
    const sa = (await integrations.rotateWebhookSecret(a.id, 'WHATSAPP', owner)).secret;
    const sb = (await integrations.rotateWebhookSecret(b.id, 'WHATSAPP', owner)).secret;

    expect(await webhook.receive(sa, eventFor(PHONE_ID_A, '254712345011', 'Hi'), { headers: {} })).toEqual({ received: true });
    expect(await prisma.whatsappContact.count({ where: { shopId: a.id, phone: '254712345011' } })).toBe(1);
    expect(await prisma.whatsappContact.count({ where: { shopId: b.id, phone: '254712345011' } })).toBe(0);

    // An event for B's number posted to A's address belongs to nobody here.
    await webhook.receive(sa, eventFor(PHONE_ID_B, '254712345012', 'Hi'), { headers: {} });
    expect(await prisma.whatsappContact.count({ where: { phone: '254712345012' } })).toBe(0);
    await webhook.receive(sb, eventFor(PHONE_ID_B, '254712345012', 'Hi'), { headers: {} });
    expect(await prisma.whatsappContact.count({ where: { shopId: b.id, phone: '254712345012' } })).toBe(1);
  });

  it('checks Meta\'s signature with that shop\'s own app secret when it has one, and still answers 200 when one event is bad', async () => {
    const shop = await connectedShop();
    await integrations.save(shop.id, 'WHATSAPP', { secrets: { appSecret: '0123456789abcdef0123456789abcdef' } }, owner);
    const { secret } = await integrations.rotateWebhookSecret(shop.id, 'WHATSAPP', owner);
    const body = eventFor(PHONE_ID_A, '254712345013', 'Hi');
    const raw = Buffer.from(JSON.stringify(body));
    await expect(webhook.receive(secret, body, { headers: {}, rawBody: raw })).rejects.toThrow(UnauthorizedException);
    await expect(webhook.receive(secret, body, { headers: { 'x-hub-signature-256': 'sha256=deadbeef' }, rawBody: raw })).rejects.toThrow(UnauthorizedException);
    const sig = `sha256=${createHmac('sha256', '0123456789abcdef0123456789abcdef').update(raw).digest('hex')}`;
    expect(await webhook.receive(secret, body, { headers: { 'x-hub-signature-256': sig }, rawBody: raw })).toEqual({ received: true });
    expect(await prisma.whatsappContact.count({ where: { shopId: shop.id, phone: '254712345013' } })).toBe(1);
  });

  it('still records STOP for a shop that has switched WhatsApp off, so nobody who opted out is forgotten', async () => {
    const shop = await connectedShop();
    const { secret } = await integrations.rotateWebhookSecret(shop.id, 'WHATSAPP', owner);
    await integrations.save(shop.id, 'WHATSAPP', { enabled: false }, owner);
    await webhook.receive(secret, eventFor(PHONE_ID_A, '254712345014', 'STOP'), { headers: {} });
    expect((await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone: '254712345014' } })).subscribed).toBe(false);
    expect(sent).toHaveLength(0); // a switched-off shop sends nothing, not even the confirmation
  });

  it('Connect gives Meta the shop\'s own address and returns it once; the address finds the shop', async () => {
    const shop = await connectedShop(PHONE_ID_A, { wabaId: '587356477784563' } as any);
    const calls: any[] = [];
    const inner = global.fetch;
    global.fetch = jest.fn(async (url: any, init: any) => {
      if (String(url).includes('/subscribed_apps')) { calls.push({ url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ success: true }), { status: 200 }); }
      return (inner as any)(url, init);
    }) as any;
    process.env.PUBLIC_API_BASE_URL = 'https://api.shops.test/';
    try {
      const result = await integrations.connectWhatsappWebhook(shop.id, owner);
      expect(result.ok).toBe(true);
      expect(result.url).toBe(`https://api.shops.test/whatsapp/webhook/${result.verifyToken}`);
      expect(calls[0].url).toContain('/587356477784563/subscribed_apps');
      expect(calls[0].body).toEqual({ override_callback_uri: result.url, verify_token: result.verifyToken });
      expect(calls[0].auth).toContain(`TOKEN-${PHONE_ID_A}`);
      expect(await integrations.findByWebhookSecret('WHATSAPP', result.verifyToken)).toMatchObject({ shopId: shop.id });
      // Meta refusing (the app's "messages" field is not subscribed yet) is passed on in words, with the address still returned for pasting by hand.
      global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: { code: 100, message: 'Callback URL or verify token could not be validated' } }), { status: 400 })) as any;
      const refused = await integrations.connectWhatsappWebhook(shop.id, owner);
      expect(refused).toMatchObject({ ok: false, message: '100: Callback URL or verify token could not be validated' });
      expect(refused.url).toContain('/whatsapp/webhook/');
      expect(await integrations.findByWebhookSecret('WHATSAPP', result.verifyToken)).toBeNull(); // the first address stopped working
    } finally { delete process.env.PUBLIC_API_BASE_URL; }
  });
});

describe('what Meta reports about a message', () => {
  it('is kept on the message, and a failure reported after acceptance puts the person back at that step', async () => {
    const shop = await connectedShop();
    const phone = '254712345020';
    await contacts.handleMessage(shop.id, inbound(phone, 'Hi'));
    const contact = await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone } });
    await prisma.whatsappContact.update({ where: { id: contact.id }, data: { nextStepAt: new Date('2026-11-09T06:59:00Z') } });
    expect((await sequence.tickShop(shop.id, new Date('2026-11-09T07:00:00Z'))).sent).toBe(1);
    const after = await prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(after.nextStep).toBe(1);
    const row = await prisma.whatsappOutreach.findFirstOrThrow({ where: { shopId: shop.id, phone } });
    expect(row.status).toBe('SENT');

    await contacts.recordStatus(shop.id, { id: row.messageId!, status: 'failed', recipient: phone, timestamp: null, errorCode: '131042', errorTitle: 'Payment issue', phoneNumberId: null });
    const failed = await prisma.whatsappOutreach.findUniqueOrThrow({ where: { id: row.id } });
    expect([failed.delivery, failed.deliveryError]).toEqual(['failed', '131042: Payment issue']);
    const reopened = await prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id } });
    expect([reopened.nextStep, reopened.failures]).toEqual([0, 0]); // an account problem is not the person's fault: not counted
    expect(reopened.nextStepAt!.getTime() - Date.now()).toBeGreaterThan(5 * 3_600_000);

    await contacts.recordStatus(shop.id, { id: row.messageId!, status: 'failed', recipient: phone, timestamp: null, errorCode: '131042', errorTitle: 'Payment issue', phoneNumberId: null });
    expect((await prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id } })).nextStep).toBe(0); // a repeated report does not move them again
    await contacts.recordStatus(shop.id, { id: row.messageId!, status: 'delivered', recipient: phone, timestamp: null, errorCode: null, errorTitle: null, phoneNumberId: null });
    expect((await prisma.whatsappOutreach.findUniqueOrThrow({ where: { id: row.id } })).delivery).toBe('delivered');
    expect(await prisma.whatsappMessageStatus.count({ where: { shopId: shop.id, messageId: row.messageId! } })).toBe(2);
  });

  it('a number that is not on WhatsApp counts against the person and is given up on after five, one that is only an account problem never is', async () => {
    const shop = await connectedShop();
    const phone = '254712345021';
    await contacts.handleMessage(shop.id, inbound(phone, 'Hi'));
    const contact = await prisma.whatsappContact.findFirstOrThrow({ where: { shopId: shop.id, phone } });
    for (let i = 0; i < 5; i += 1) {
      await prisma.whatsappContact.update({ where: { id: contact.id }, data: { nextStep: 1, nextStepAt: new Date() } });
      const row = await prisma.whatsappOutreach.create({ data: { shopId: shop.id, phone, kind: 'GROUP', template: 'join_group', status: 'SENT', messageId: `wamid.F${i}`, triggeredBy: 't', contactId: contact.id } });
      await contacts.recordStatus(shop.id, { id: row.messageId!, status: 'failed', recipient: phone, timestamp: null, errorCode: '131026', errorTitle: 'Undeliverable', phoneNumberId: null });
    }
    const c = await prisma.whatsappContact.findUniqueOrThrow({ where: { id: contact.id } });
    expect([c.failures, c.nextStepAt]).toEqual([5, null]);
  });

  it('is applied to the daily report the shop sent, and only in that shop', async () => {
    const a = await connectedShop(PHONE_ID_A);
    const b = await connectedShop(PHONE_ID_B);
    await prisma.dailyReportSetting.create({ data: { shopId: a.id, enabled: true, emailRecipients: [], whatsappRecipients: ['0722000111'], updatedBy: 'test' } });
    const reports = new DailyReportService(prisma, { sendDetailed: jest.fn(async () => ({ ok: true })) } as any, new WhatsAppService(integrations), new MarketingSummaryService(prisma));
    await reports.deliver(a.id, '2026-11-04', { force: true });
    const run = await prisma.dailyReportRun.findFirstOrThrow({ where: { shopId: a.id, channel: 'WHATSAPP' } });
    expect(run.messageId).toMatch(/^wamid\.OUT/);
    expect(run.delivery).toBeNull();

    await contacts.recordStatus(b.id, { id: run.messageId!, status: 'delivered', recipient: '254722000111', timestamp: null, errorCode: null, errorTitle: null, phoneNumberId: null });
    expect((await prisma.dailyReportRun.findUniqueOrThrow({ where: { id: run.id } })).delivery).toBeNull(); // another shop's report on the same id changes nothing
    await contacts.recordStatus(a.id, { id: run.messageId!, status: 'sent', recipient: '254722000111', timestamp: null, errorCode: null, errorTitle: null, phoneNumberId: null });
    await contacts.recordStatus(a.id, { id: run.messageId!, status: 'delivered', recipient: '254722000111', timestamp: null, errorCode: null, errorTitle: null, phoneNumberId: null });
    expect((await prisma.dailyReportRun.findUniqueOrThrow({ where: { id: run.id } })).delivery).toBe('delivered');
    // Sending it again forgets the old report: it is a different message.
    await reports.deliver(a.id, '2026-11-04', { force: true });
    expect((await prisma.dailyReportRun.findUniqueOrThrow({ where: { id: run.id } })).delivery).toBeNull();
  });
});

describe('sending to customers from the portal', () => {
  const person = (shopId: string, phone: string | null, first = 'Wanjiru', last = 'K') => prisma.customer.create({ data: { shopId, firstName: first, lastName: last, email: `${Math.random().toString(36).slice(2)}@c.test`, phone } });
  const keyOf = (c: { id: string }) => `c_${c.id}`;

  it('uses the shop\'s own number, token and template with the group link; a person who received it is skipped, and a failed one is not', async () => {
    const shop = await connectedShop(PHONE_ID_A, { templateGroup: 'nairobi_group' });
    const a = await person(shop.id, '0722 111 001');
    const b = await person(shop.id, '0722111002', 'Brian', 'O');
    const none = await person(shop.id, null, 'No', 'Phone');
    let r = await outreach.send(shop.id, { kind: 'GROUP', keys: [keyOf(a), keyOf(b), keyOf(none), 'c_missing'], triggeredBy: 'owner@shop.test' });
    expect([r.sent, r.failed, r.skipped]).toEqual([2, 0, 2]);
    expect(sent.filter((s) => s.type === 'template').map((s) => [s.to, s.template, s.params, s.phoneNumberId])).toEqual([
      ['254722111001', 'nairobi_group', ['Wanjiru', 'https://chat.whatsapp.com/GROUP'], PHONE_ID_A],
      ['254722111002', 'nairobi_group', ['Brian', 'https://chat.whatsapp.com/GROUP'], PHONE_ID_A],
    ]);
    expect(r.results.filter((x) => x.outcome === 'SKIPPED').map((x) => x.detail).sort()).toEqual(['Customer not found, or has no phone number', 'Customer not found, or has no phone number']);

    sent = [];
    r = await outreach.send(shop.id, { kind: 'GROUP', keys: [keyOf(a)], triggeredBy: 't' });
    expect(r.results[0]).toMatchObject({ outcome: 'SKIPPED', detail: 'Already sent' });
    expect(sent).toHaveLength(0);
    r = await outreach.send(shop.id, { kind: 'GROUP', keys: [keyOf(a)], force: true, triggeredBy: 't' });
    expect(r.sent).toBe(1); // "send again" is the owner's explicit choice

    // Accepted, then reported failed (payment): that is not "received", so it is offered again.
    const row = await prisma.whatsappOutreach.findFirstOrThrow({ where: { shopId: shop.id, phone: '254722111002' } });
    await contacts.recordStatus(shop.id, { id: row.messageId!, status: 'failed', recipient: '254722111002', timestamp: null, errorCode: '131042', errorTitle: 'Payment issue', phoneNumberId: null });
    expect((await outreach.unsentKeys(shop.id, 'GROUP')).keys).toEqual([keyOf(b)]);
    sent = [];
    r = await outreach.send(shop.id, { kind: 'GROUP', keys: [keyOf(b)], triggeredBy: 't' });
    expect(r.sent).toBe(1);
  });

  it('never messages someone who replied STOP, by any route, and the same phone twice in a batch is sent once', async () => {
    const shop = await connectedShop();
    const a = await person(shop.id, '0722111010');
    const twin = await person(shop.id, '+254 722 111 010', 'Wanjiru', 'Again');
    await contacts.handleMessage(shop.id, inbound('254722111010', 'stop'));
    sent = [];
    const r = await outreach.send(shop.id, { kind: 'REVIEW', keys: [keyOf(a), keyOf(twin)], triggeredBy: 't' });
    expect(r.results.map((x) => x.detail)).toEqual(['Replied STOP', 'Replied STOP']);
    expect(sent).toHaveLength(0);
    expect((await outreach.unsentKeys(shop.id, 'REVIEW')).keys).toEqual([]);
    expect(await outreach.sendToPhone(shop.id, { kind: 'GROUP', phone: '254722111010', triggeredBy: 't' })).toEqual({ outcome: 'SKIPPED', detail: 'Replied STOP' });

    const c = await person(shop.id, '0722111011');
    const d = await person(shop.id, '0722 111 011', 'Dup', 'Row');
    const r2 = await outreach.send(shop.id, { kind: 'REVIEW', keys: [keyOf(c), keyOf(d)], triggeredBy: 't' });
    expect([r2.sent, r2.skipped]).toEqual([1, 1]);
  });

  it('needs the shop\'s own connection: the operator\'s sender is never used for a customer', async () => {
    await prisma.platformIntegration.deleteMany({});
    await integrations.savePlatform({ enabled: true, config: { phoneNumberId: '999999999999' }, secrets: { accessToken: 'PLATFORM-token-0123456789abcdef' } }, { id: null, email: 'op@platform.test' });
    const shop = await makeShop({ whatsappGroupUrl: 'https://chat.whatsapp.com/G' });
    const a = await person(shop.id, '0722111020');
    await expect(outreach.send(shop.id, { kind: 'GROUP', keys: [keyOf(a)], triggeredBy: 't' })).rejects.toThrow(/WhatsApp is not connected for this shop/);
    expect((await outreach.availability(shop.id)).configured).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('says what is missing in words: a template, a link, or the connection', async () => {
    const shop = await connectedShop(PHONE_ID_A, {}, { whatsappGroupUrl: null, googleReviewsUrl: 'https://g.page/r/X' });
    const a = await person(shop.id, '0722111030');
    const status = await outreach.availability(shop.id);
    const by = Object.fromEntries(status.kinds.map((k) => [k.kind, k]));
    expect(by.GROUP).toMatchObject({ ready: false, missing: 'Add the WhatsApp group link under Store info.' });
    expect(by.REVIEW).toMatchObject({ ready: true, missing: null });
    expect(by.LOCATION).toMatchObject({ ready: false, missing: 'Name its template under Connections.' });
    await expect(outreach.send(shop.id, { kind: 'GROUP', keys: [keyOf(a)], triggeredBy: 't' })).rejects.toThrow(/no link for "Join the WhatsApp group"/);
    await expect(outreach.send(shop.id, { kind: 'LOCATION', keys: [keyOf(a)], triggeredBy: 't' })).rejects.toThrow(BadRequestException);
    await integrations.save(shop.id, 'WHATSAPP', { config: { templateLocation: 'find_us' } }, owner);
    sent = [];
    const r = await outreach.send(shop.id, { kind: 'LOCATION', keys: [keyOf(a)], triggeredBy: 't' });
    expect(r.sent).toBe(1);
    expect(sent[0]).toMatchObject({ template: 'find_us' });
    expect(sent[0].params).toBeUndefined(); // a fixed-text template is sent with no variables
  });

  it('shows only the shop\'s own people and history', async () => {
    const a = await connectedShop(PHONE_ID_A);
    const b = await connectedShop(PHONE_ID_B);
    const pa = await person(a.id, '0722111040', 'Alice', 'A');
    await person(b.id, '0722111041', 'Bob', 'B');
    await outreach.send(a.id, { kind: 'GROUP', keys: [keyOf(pa)], triggeredBy: 't' });
    const listA = await outreach.recipients(a.id, {});
    expect(listA.customers.map((c) => c.name)).toEqual(['Alice A']);
    expect(listA.customers[0].sent).toHaveProperty('GROUP');
    expect((await outreach.history(a.id, {})).total).toBe(1);
    expect((await outreach.history(b.id, {})).total).toBe(0);
    expect((await outreach.recipients(b.id, {})).customers.map((c) => c.name)).toEqual(['Bob B']);
  });
});

describe('the welcome series', () => {
  const NOW = new Date('2026-11-09T07:00:00Z'); // 10:00 in Nairobi
  const welcomed = async (shopId: string, phone: string, nextStep = 0) => {
    await contacts.handleMessage(shopId, inbound(phone, 'Hi'));
    const c = await prisma.whatsappContact.findFirstOrThrow({ where: { shopId, phone } });
    return prisma.whatsappContact.update({ where: { id: c.id }, data: { nextStep, nextStepAt: new Date(NOW.getTime() - 60_000) } });
  };

  it('sends the group, then the rating, each to someone who was told, in order and spaced, and finishes', async () => {
    const shop = await connectedShop();
    const c = await welcomed(shop.id, '254712345030');
    sent = [];
    expect(await sequence.tickShop(shop.id, NOW)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sent[0]).toMatchObject({ to: '254712345030', template: 'join_group', params: ['Wanjiru', 'https://chat.whatsapp.com/GROUP'] });
    let now = await prisma.whatsappContact.findUniqueOrThrow({ where: { id: c.id } });
    expect([now.nextStep, now.failures]).toEqual([1, 0]);
    expect(now.nextStepAt!.getTime() - NOW.getTime()).toBe(48 * 3_600_000);

    await prisma.whatsappContact.update({ where: { id: c.id }, data: { nextStepAt: new Date(NOW.getTime() - 1) } });
    sent = [];
    expect((await sequence.tickShop(shop.id, NOW)).sent).toBe(1);
    expect(sent[0]).toMatchObject({ template: 'rate_us', params: ['Wanjiru', 'https://g.page/r/REVIEW'] });
    now = await prisma.whatsappContact.findUniqueOrThrow({ where: { id: c.id } });
    expect([now.nextStep, now.nextStepAt]).toEqual([2, null]);
    expect((await contacts.stats(shop.id)).finished).toBe(1);
  });

  it('does nothing outside 08:00-20:00 Nairobi, with the welcome off, for someone not yet told, or for someone who replied STOP', async () => {
    const shop = await connectedShop();
    await welcomed(shop.id, '254712345031');
    sent = [];
    expect((await sequence.tick(new Date('2026-11-09T01:00:00Z'))).sent).toBe(0); // 04:00
    expect((await sequence.tick(new Date('2026-11-09T18:00:00Z'))).sent).toBe(0); // 21:00
    expect(sent).toHaveLength(0);

    const untold = await welcomed(shop.id, '254712345032');
    await prisma.whatsappContact.update({ where: { id: untold.id }, data: { noticeSentAt: null } });
    const stopped = await welcomed(shop.id, '254712345033');
    await contacts.handleMessage(shop.id, inbound('254712345033', 'STOP'));
    await prisma.whatsappContact.update({ where: { id: stopped.id }, data: { nextStepAt: new Date(NOW.getTime() - 1000) } });
    await prisma.whatsappContact.deleteMany({ where: { shopId: shop.id, phone: '254712345031' } });
    sent = [];
    expect((await sequence.tickShop(shop.id, NOW)).sent).toBe(0);
    expect(sent).toHaveLength(0);

    // Someone who is already due, in a shop that has since switched the welcome off: nothing goes out.
    const waiting = await welcomed(shop.id, '254712345034');
    await integrations.save(shop.id, 'WHATSAPP', { config: { autoSubscribe: 'false' } }, owner);
    await prisma.whatsappContact.update({ where: { id: waiting.id }, data: { nextStepAt: new Date(NOW.getTime() - 1000) } });
    expect((await sequence.tickShop(shop.id, NOW)).sent).toBe(0);
    expect(sentTo('254712345034')).toHaveLength(1); // only the notice they got when it was on
  });

  it('keeps to each shop\'s own daily cap, and one shop\'s sends do not use up another\'s', async () => {
    const a = await connectedShop(PHONE_ID_A, { dailySendCap: '2' });
    const b = await connectedShop(PHONE_ID_B, { dailySendCap: '2' });
    for (const n of ['40', '41', '42', '43']) await welcomed(a.id, `2547123450${n}`);
    await welcomed(b.id, '254712345044');
    sent = [];
    expect((await sequence.tickShop(a.id, NOW)).sent).toBe(2);
    expect((await sequence.tickShop(a.id, NOW)).sent).toBe(0); // the cap is for the day, across checks
    expect((await sequence.tickShop(b.id, NOW)).sent).toBe(1);
    expect(sent.filter((s) => s.phoneNumberId === PHONE_ID_A)).toHaveLength(2);
    expect(sent.filter((s) => s.phoneNumberId === PHONE_ID_B)).toHaveLength(1);
  });

  it('passes a step the shop has no link for, instead of failing on it for ever, and never claims one twice', async () => {
    const shop = await connectedShop(PHONE_ID_A, {}, { whatsappGroupUrl: null });
    const c = await welcomed(shop.id, '254712345050');
    sent = [];
    expect(await sequence.tickShop(shop.id, NOW)).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect((await prisma.whatsappContact.findUniqueOrThrow({ where: { id: c.id } })).nextStep).toBe(1);
    await prisma.whatsappContact.update({ where: { id: c.id }, data: { nextStepAt: new Date(NOW.getTime() - 1) } });
    expect((await sequence.tickShop(shop.id, NOW)).sent).toBe(1);
    expect(sent[0]).toMatchObject({ template: 'rate_us' });

    const other = await connectedShop(PHONE_ID_B);
    await welcomed(other.id, '254712345051');
    sent = [];
    const both = await Promise.all([sequence.tickShop(other.id, NOW), sequence.tickShop(other.id, NOW)]);
    expect(both.reduce((n, r) => n + r.sent, 0)).toBe(1); // two backend slots at once send it once
    expect(sentTo('254712345051')).toHaveLength(1);
  });

  it('a failed send is retried a few times and then given up on; only shops that switched it on are visited', async () => {
    const on = await connectedShop(PHONE_ID_A);
    const off = await connectedShop(PHONE_ID_B, { autoSubscribe: 'false' });
    const c = await welcomed(on.id, '254712345060');
    // A contact already waiting in a shop that has the welcome switched off.
    await prisma.whatsappContact.create({ data: { shopId: off.id, phone: '254712345061', noticeSentAt: new Date(), nextStepAt: new Date(NOW.getTime() - 60_000) } });
    failNext = [{ status: 400, error: { code: 131026, message: 'Undeliverable' } }];
    sent = [];
    const all = await sequence.tick(NOW);
    expect(all).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(sentTo('254712345061')).toHaveLength(0);
    expect((await prisma.whatsappContact.findUniqueOrThrow({ where: { id: c.id } })).failures).toBe(1);
    await prisma.whatsappContact.update({ where: { id: c.id }, data: { failures: 4, nextStepAt: new Date(NOW.getTime() - 1) } });
    failNext = [{ status: 400, error: { code: 131026, message: 'Undeliverable' } }];
    await sequence.tickShop(on.id, NOW);
    const done = await prisma.whatsappContact.findUniqueOrThrow({ where: { id: c.id } });
    expect([done.failures, done.nextStepAt]).toEqual([5, null]);
  });
});
