import { PROVIDERS, cleanInput, externalIdKey, requiredKeys, secretHint } from '../../src/integrations/integration-providers';
import { whatsAppFromEnvironment } from '../../src/integrations/env-import';
import { WhatsAppClient } from '../../src/integrations/whatsapp-client';

describe('what each connection is made of', () => {
  it('every provider names the id Meta knows it by and what it cannot work without', () => {
    expect(externalIdKey('WHATSAPP')).toBe('phoneNumberId');
    expect(externalIdKey('FACEBOOK')).toBe('pageId');
    expect(externalIdKey('THREADS')).toBe('userId');
    expect(requiredKeys('WHATSAPP').sort()).toEqual(['accessToken', 'phoneNumberId']);
    expect(requiredKeys('FACEBOOK').sort()).toEqual(['pageAccessToken', 'pageId']);
    expect(requiredKeys('THREADS')).toEqual(['accessToken']); // the account id is found from the token
  });

  it('every shop brings its own Meta app: the app id and secret are fields of each connection', () => {
    for (const provider of ['WHATSAPP', 'FACEBOOK', 'THREADS'] as const) {
      const keys = PROVIDERS[provider].fields.map((f) => f.key);
      expect(keys).toContain('appId');
      expect(keys).toContain('appSecret');
      expect(PROVIDERS[provider].fields.find((f) => f.key === 'appSecret')!.kind).toBe('secret');
    }
  });

  it('secrets show only that they are set and their last four characters', () => {
    expect(secretHint('EAANabcdefghijklmnop1234')).toBe('••••1234');
    expect(secretHint('')).toBeNull();
    expect(secretHint(undefined)).toBeNull();
    expect(secretHint('EAANabcdefghijklmnop1234')).not.toContain('EAAN');
  });
});

describe('checking what an owner typed', () => {
  it('accepts good values and trims them', () => {
    const out = cleanInput('WHATSAPP', { config: { phoneNumberId: ' 543573888841483 ', reportTemplate: 'daily_report' }, secrets: { accessToken: 'EAANabcdefghijklmnop1234' } });
    expect(out.config).toEqual({ phoneNumberId: '543573888841483', reportTemplate: 'daily_report' });
    expect(out.secrets).toEqual({ accessToken: 'EAANabcdefghijklmnop1234' });
  });

  it('refuses a value that is plainly not what the field takes, with a message the owner can act on', () => {
    expect(() => cleanInput('WHATSAPP', { config: { phoneNumberId: '+254 713 206 481' } })).toThrow(/Phone number ID does not look right \(digits only\)/);
    expect(() => cleanInput('WHATSAPP', { secrets: { accessToken: 'has a space in it, so no' } })).toThrow(/Access token does not look right \(no spaces\)/);
    expect(() => cleanInput('FACEBOOK', { config: { pageUrl: 'http://insecure.example' } })).toThrow(/Page link/);
    expect(() => cleanInput('WHATSAPP', { config: { reportTemplate: 'Daily Report' } })).toThrow(/template name/i);
  });

  it('refuses a field that belongs to another provider, or to the other kind (a secret sent as a setting)', () => {
    expect(() => cleanInput('WHATSAPP', { config: { pageId: '123456' } })).toThrow(/not a setting of WhatsApp/);
    expect(() => cleanInput('WHATSAPP', { config: { accessToken: 'EAANabcdefghijklmnop1234' } })).toThrow(/not a setting/);
    expect(() => cleanInput('THREADS', { secrets: { userId: '123456789' } })).toThrow(/not a secret/);
    expect(() => cleanInput('THREADS', { clear: ['nonsense'] })).toThrow(/not a field/);
  });

  it('a blank secret means keep it; a blank setting means clear it; clear is explicit', () => {
    const out = cleanInput('FACEBOOK', { config: { pageUrl: '' }, secrets: { pageAccessToken: '   ', appSecret: '' }, clear: ['appId'] });
    expect(out.secrets).toEqual({});
    expect(out.config).toEqual({});
    expect(out.clear.sort()).toEqual(['appId', 'pageUrl']);
  });
});

describe('the one-time import of the old environment values', () => {
  it('needs both the number id and the token, and fills the template defaults', () => {
    expect(whatsAppFromEnvironment({ WHATSAPP_PHONE_NUMBER_ID: '111' } as any)).toBeNull();
    expect(whatsAppFromEnvironment({ WHATSAPP_ACCESS_TOKEN: 'x'.repeat(30) } as any)).toBeNull();
    expect(whatsAppFromEnvironment({ WHATSAPP_PHONE_NUMBER_ID: ' 111 ', WHATSAPP_ACCESS_TOKEN: 'x'.repeat(30) } as any)).toEqual({ phoneNumberId: '111', accessToken: 'x'.repeat(30), template: 'daily_report', language: 'en' });
    expect(whatsAppFromEnvironment({ WHATSAPP_PHONE_NUMBER_ID: '111', WHATSAPP_ACCESS_TOKEN: 'x'.repeat(30), WHATSAPP_REPORT_TEMPLATE: 'my_report', WHATSAPP_TEMPLATE_LANG: 'en_GB' } as any)).toMatchObject({ template: 'my_report', language: 'en_GB' });
  });
});

describe('the WhatsApp client', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('sends the template with the shop\'s own number id and token, and omits components when there are no variables', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    global.fetch = jest.fn(async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }); }) as any;
    const client = new WhatsAppClient({ phoneNumberId: '555', accessToken: 'tok-abcdefghijklmnop', template: 'daily_report', language: 'en' });
    expect(await client.sendTemplate('0722 000 111', ['Shop', 'Wed', '1'])).toEqual({ delivered: true, messageId: 'wamid.1' });
    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/555/messages');
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok-abcdefghijklmnop');
    expect(JSON.parse(calls[0].init.body).to).toBe('254722000111');
    expect(JSON.parse(calls[0].init.body).template.components[0].parameters).toHaveLength(3);
    await client.sendTemplate('0722 000 111', []);
    expect(JSON.parse(calls[1].init.body).template).not.toHaveProperty('components');
  });

  it('reports Meta\'s own reason, never throws, and never repeats the token', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: { code: 131042, message: 'Business eligibility payment issue' } }), { status: 400 })) as any;
    const client = new WhatsAppClient({ phoneNumberId: '555', accessToken: 'tok-secret-abcdefghijkl', template: 't', language: 'en' });
    const result = await client.sendTemplate('0722000111', ['x']);
    expect(result).toEqual({ delivered: false, error: 'Business eligibility payment issue' });
    expect(JSON.stringify(result)).not.toContain('tok-secret');
    expect(await client.sendTemplate('abc', [])).toEqual({ delivered: false, error: 'Unusable WhatsApp number "abc"' });
    global.fetch = jest.fn(async () => { throw new Error('socket hang up'); }) as any;
    expect((await client.sendTemplate('0722000111', [])).delivered).toBe(false);
  });
});
