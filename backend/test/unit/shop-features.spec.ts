import { ShopFacts, coverageSummary, featureCoverage } from '../../src/admin/shop-features';

const none = { present: false, enabled: false, lastError: null, lastCheckedAt: null };
const base = (over: Partial<ShopFacts> = {}): ShopFacts => ({
  paystackReady: false, paidOrders: 0,
  products: { shown: 0, shareable: 0, noPhoto: 0 },
  info: { whatsappNumber: false, contact: false, address: false, hours: false, tagline: false },
  whatsapp: { ...none, sent30: 0, welcome: false }, facebook: { ...none, replies30: 0, commentReplies: false }, threads: { ...none },
  posting: { facebookEnabled: false, threadsEnabled: false, posted30: 0, failed30: 0, serverAllows: true },
  status: { prepared30: 0, posted30: 0 }, shares30: 0,
  dailyReport: { enabled: false, recipients: 0 },
  tracking: { ga4: false, searchConsole: false, meta: false, tiktok: false, x: false },
  domain: { custom: false, pending: false },
  ...over,
});
const state = (f: ShopFacts, key: string) => featureCoverage(f).find((x) => x.key === key)!;

describe('a brand new shop', () => {
  it('needs its three basics and has nothing wrong', () => {
    const features = featureCoverage(base());
    expect(features.filter((f) => f.state === 'setup').map((f) => f.key).sort()).toEqual(['catalogue', 'payments', 'storeInfo']);
    expect(coverageSummary(features)).toEqual({ basics: { done: 0, total: 3 }, extras: { on: 0, total: 9 }, problems: 0 });
  });
});

describe('the basics', () => {
  it('payments: set up, then used', () => {
    expect(state(base({ paystackReady: true }), 'payments').state).toBe('ready');
    expect(state(base({ paystackReady: true, paidOrders: 3 }), 'payments')).toMatchObject({ state: 'working', detail: '3 paid orders' });
  });
  it('products: shown but all sold out is a problem, not a success', () => {
    expect(state(base({ products: { shown: 4, shareable: 0, noPhoto: 0 } }), 'catalogue').state).toBe('problem');
    expect(state(base({ products: { shown: 4, shareable: 2, noPhoto: 1 } }), 'catalogue').detail).toBe('2 in stock, 1 without a photo');
  });
  it('store info: a way to reach the shop comes first, a place second', () => {
    expect(state(base({ info: { whatsappNumber: true, contact: false, address: false, hours: false, tagline: false } }), 'storeInfo').state).toBe('ready');
    expect(state(base({ info: { whatsappNumber: true, contact: false, address: true, hours: false, tagline: false } }), 'storeInfo').state).toBe('working');
    expect(state(base({ info: { whatsappNumber: false, contact: false, address: true, hours: true, tagline: true } }), 'storeInfo').state).toBe('setup');
  });
  it('counts the basics as done when working or ready', () => {
    const f = base({ paystackReady: true, products: { shown: 1, shareable: 1, noPhoto: 0 } });
    expect(coverageSummary(featureCoverage(f)).basics).toEqual({ done: 2, total: 3 });
  });
});

describe('connections', () => {
  const on = { present: true, enabled: true, lastError: null, lastCheckedAt: new Date() };
  it('off when not connected, and says customers still reach the shop', () => {
    expect(state(base(), 'whatsapp')).toMatchObject({ state: 'off' });
    expect(state(base(), 'whatsapp').detail).toContain('Not connected');
    expect(state(base(), 'whatsapp').detail).toContain('WhatsApp link');
  });
  it('a saved error is a problem, with the reason', () => {
    const f = base({ whatsapp: { ...on, lastError: 'Invalid OAuth access token', sent30: 0, welcome: false } });
    expect(state(f, 'whatsapp')).toMatchObject({ state: 'problem' });
    expect(state(f, 'whatsapp').detail).toContain('Invalid OAuth access token');
  });
  it('working once it has sent; ready before; never tested says so', () => {
    expect(state(base({ whatsapp: { ...on, sent30: 12, welcome: true } }), 'whatsapp').state).toBe('working');
    expect(state(base({ whatsapp: { ...on, sent30: 0, welcome: true } }), 'whatsapp').state).toBe('ready');
    expect(state(base({ whatsapp: { ...on, lastCheckedAt: null, sent30: 0, welcome: true } }), 'whatsapp').detail).toContain('never tested');
  });
});

describe('auto-posting', () => {
  const conn = { present: true, enabled: true, lastError: null, lastCheckedAt: new Date() };
  it('is a problem when switched on without a connection', () => {
    const f = base({ posting: { facebookEnabled: true, threadsEnabled: false, posted30: 0, failed30: 0, serverAllows: true } });
    expect(state(f, 'posting').state).toBe('problem');
  });
  it('is a problem when the server switch is off', () => {
    const f = base({ facebook: { ...conn, replies30: 0, commentReplies: false }, posting: { facebookEnabled: true, threadsEnabled: false, posted30: 0, failed30: 0, serverAllows: false } });
    expect(state(f, 'posting').detail).toContain('whole server');
  });
  it('is a problem when most posts fail, but not on a single failure', () => {
    const fb = { ...conn, replies30: 0, commentReplies: false };
    expect(state(base({ facebook: fb, posting: { facebookEnabled: true, threadsEnabled: false, posted30: 1, failed30: 5, serverAllows: true } }), 'posting').state).toBe('problem');
    expect(state(base({ facebook: fb, posting: { facebookEnabled: true, threadsEnabled: false, posted30: 0, failed30: 1, serverAllows: true } }), 'posting').state).toBe('ready');
    expect(state(base({ facebook: fb, posting: { facebookEnabled: true, threadsEnabled: false, posted30: 9, failed30: 1, serverAllows: true } }), 'posting').state).toBe('working');
  });
  it('is off when nothing is switched on', () => {
    expect(state(base(), 'posting').state).toBe('off');
  });
});

describe('optional extras', () => {
  it('Status kit needs no connection: used when pictures were posted', () => {
    expect(state(base({ status: { prepared30: 3, posted30: 2 } }), 'statusKit').state).toBe('working');
    expect(state(base({ status: { prepared30: 3, posted30: 0 } }), 'statusKit').state).toBe('ready');
    expect(state(base(), 'statusKit').state).toBe('off');
  });
  it('daily report with nobody to send to needs setting up', () => {
    expect(state(base({ dailyReport: { enabled: true, recipients: 0 } }), 'dailyReport').state).toBe('setup');
    expect(state(base({ dailyReport: { enabled: true, recipients: 2 } }), 'dailyReport').state).toBe('working');
  });
  it('names the trackers that are set', () => {
    const f = base({ tracking: { ga4: true, meta: true, tiktok: false, x: false, searchConsole: false } });
    expect(state(f, 'tracking').detail).toBe('Google Analytics, Meta');
  });
  it('a pending domain needs setup; a connected one works', () => {
    expect(state(base({ domain: { custom: false, pending: true } }), 'domain').state).toBe('setup');
    expect(state(base({ domain: { custom: true, pending: false } }), 'domain').state).toBe('working');
  });
});
