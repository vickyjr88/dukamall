import { createHmac } from 'crypto';
import {
  ACCOUNT_LEVEL_ERRORS, classifyKeyword, inSendWindow, noticeText, parseWebhook, pickDelivery, startOfNairobiDay, stoppedText, verifySignature,
} from '../../src/whatsapp/whatsapp-subscription';
import { SEQUENCE, SEQUENCE_DELAYS_HOURS, greetingName, hasVariables, safeUrl, templateFor, whatsappSettings } from '../../src/whatsapp/whatsapp-kinds';

describe('STOP is the whole message', () => {
  it('in any case or punctuation; a sentence that merely contains it is not an opt-out', () => {
    for (const text of ['STOP', 'stop', ' Stop. ', 'STOP!!', 'Unsubscribe', 'opt out', 'Opt-out', 'STOP ALL']) expect(classifyKeyword(text)).toBe('STOP');
    for (const text of ['please do not stop the delivery', 'stop calling me about the order', 'cancel', 'cancel my order', 'hello', '', null, undefined]) expect(classifyKeyword(text as any)).toBeNull();
    for (const text of ['START', 'start', 'Subscribe.']) expect(classifyKeyword(text)).toBe('START');
  });

  it('the notice, the stop confirmation and the welcome-back use the shop\'s own name and tell people how to stop', () => {
    expect(noticeText('Nairobi Gents')).toContain('messaging Nairobi Gents');
    expect(noticeText('Nairobi Gents')).toMatch(/Reply STOP at any time to opt out/);
    expect(stoppedText('Phone Hub')).toContain('Phone Hub');
    expect(noticeText('Phone Hub')).not.toContain('Nairobi Gents');
  });
});

const payload = (over: any = {}, phoneNumberId = '543573888841483') => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: phoneNumberId, display_phone_number: '254113206481' },
    contacts: [{ wa_id: '254712345678', profile: { name: 'Wanjiru K' } }],
    messages: [{ id: 'wamid.A', from: '254712345678', type: 'text', timestamp: '1793900000', text: { body: 'Hi, is the Seiko 5 available?' },
      referral: { source_id: '1203', headline: 'Seiko 5, KSh 12,500', ctwa_clid: 'abc123', source_type: 'ad' } }],
    statuses: [{ id: 'wamid.B', status: 'failed', timestamp: '1793900100', recipient_id: '254771114712', errors: [{ code: 131026, title: 'Message undeliverable' }] }],
    ...over,
  } }] }],
});

describe('what Meta sends', () => {
  it('gives the messages (name, text, ad, which number) and the delivery reports (with the reason)', () => {
    const { messages, statuses } = parseWebhook(payload());
    expect(messages.map((m) => [m.id, m.from, m.name, m.text, m.referral, m.phoneNumberId])).toEqual([
      ['wamid.A', '254712345678', 'Wanjiru K', 'Hi, is the Seiko 5 available?', { sourceId: '1203', headline: 'Seiko 5, KSh 12,500', clickId: 'abc123' }, '543573888841483'],
    ]);
    expect(statuses.map((s) => [s.id, s.status, s.recipient, s.errorCode, s.errorTitle, s.phoneNumberId])).toEqual([['wamid.B', 'failed', '254771114712', '131026', 'Message undeliverable', '543573888841483']]);
    for (const bad of [null, {}, { entry: 'x' }, { entry: [{ changes: [{ field: 'other', value: {} }] }] }]) expect(parseWebhook(bad)).toEqual({ messages: [], statuses: [] });
  });

  it('checks the signature against the exact body, and a wrong or missing one fails', () => {
    const body = Buffer.from(JSON.stringify(payload()));
    const good = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
    expect(verifySignature(body, good, 'app-secret')).toBe(true);
    expect(verifySignature(body, good, 'other-secret')).toBe(false);
    expect(verifySignature(Buffer.from(body.toString() + ' '), good, 'app-secret')).toBe(false);
    expect(verifySignature(body, undefined, 'app-secret')).toBe(false);
    expect(verifySignature(undefined, good, 'app-secret')).toBe(false);
  });

  it('keeps the freshest delivery state: read beats delivered beats sent, and a late failure never overwrites a delivery', () => {
    expect(pickDelivery(null, 'sent')).toBe('sent');
    expect(pickDelivery('sent', 'delivered')).toBe('delivered');
    expect(pickDelivery('read', 'delivered')).toBe('read');
    expect(pickDelivery('delivered', 'failed')).toBe('delivered');
    expect(pickDelivery('sent', 'failed')).toBe('failed');
    expect(pickDelivery('failed', 'delivered')).toBe('delivered');
    expect(ACCOUNT_LEVEL_ERRORS.has('131042')).toBe(true);
    expect(ACCOUNT_LEVEL_ERRORS.has('131026')).toBe(false);
  });
});

describe('when messages may go out', () => {
  it('only between 08:00 and 20:00 Nairobi time, and "today" starts at Nairobi midnight', () => {
    expect(inSendWindow(new Date('2026-11-08T04:59:00Z'))).toBe(false); // 07:59
    expect(inSendWindow(new Date('2026-11-08T05:00:00Z'))).toBe(true); // 08:00
    expect(inSendWindow(new Date('2026-11-08T16:59:00Z'))).toBe(true); // 19:59
    expect(inSendWindow(new Date('2026-11-08T17:00:00Z'))).toBe(false); // 20:00
    expect(startOfNairobiDay(new Date('2026-11-08T22:30:00Z')).toISOString()).toBe('2026-11-08T21:00:00.000Z'); // already the 9th in Nairobi
    expect(startOfNairobiDay(new Date('2026-11-08T10:00:00Z')).toISOString()).toBe('2026-11-07T21:00:00.000Z');
  });
});

describe('the shop\'s messages and settings', () => {
  it('uses the shop\'s own template names, with sensible defaults for the two with a link and none for the fixed ones', () => {
    expect(templateFor('GROUP', {})).toBe('join_group');
    expect(templateFor('REVIEW', {})).toBe('rate_us');
    expect(templateFor('LOCATION', {})).toBeNull();
    expect(templateFor('RANGE', {})).toBeNull();
    expect(templateFor('GROUP', { templateGroup: 'my_group_invite' })).toBe('my_group_invite');
    expect(templateFor('LOCATION', { templateLocation: 'find_us' })).toBe('find_us');
    expect(SEQUENCE).toEqual(['GROUP', 'REVIEW']);
    expect(SEQUENCE_DELAYS_HOURS).toHaveLength(SEQUENCE.length);
    expect([hasVariables('GROUP'), hasVariables('REVIEW'), hasVariables('LOCATION'), hasVariables('RANGE')]).toEqual([true, true, false, false]);
  });

  it('features start off, and the daily cap is a sensible number whatever is typed', () => {
    expect(whatsappSettings({})).toEqual({ autoSubscribe: false, dailySendCap: 200 });
    expect(whatsappSettings({ autoSubscribe: 'true', dailySendCap: '120' })).toEqual({ autoSubscribe: true, dailySendCap: 120 });
    expect(whatsappSettings({ dailySendCap: '99999' }).dailySendCap).toBe(1000);
    expect(whatsappSettings({ dailySendCap: 'lots' }).dailySendCap).toBe(200);
    expect(whatsappSettings({ autoSubscribe: 'yes' }).autoSubscribe).toBe(false);
  });

  it('sends only web links, and greets by first name or "there" when the name is really a number or an email', () => {
    expect(safeUrl('https://chat.whatsapp.com/abc')).toBe('https://chat.whatsapp.com/abc');
    for (const bad of ['javascript:alert(1)', 'not a url', '', null, undefined, 'ftp://x.test']) expect(safeUrl(bad as any)).toBeNull();
    expect(greetingName('wanjiru kamau')).toBe('Wanjiru');
    for (const bad of ['0722111222', 'a@b.co', '', null, undefined]) expect(greetingName(bad as any)).toBe('there');
  });
});
