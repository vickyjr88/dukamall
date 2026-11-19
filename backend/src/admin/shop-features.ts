/**
 * Which of the platform's features each shop has set up, and whether they work. One place decides it, so the operator's Shops list and the
 * shop's own page in the admin console always agree. Pure: it is given facts and returns words, so the rules are tested without a database.
 *
 * A feature is one of:
 *  - `working`  it is on and has done something in the last 30 days
 *  - `ready`    it is on and set up, but has not been used yet
 *  - `off`      not used, and that is fine (it is optional, or switched off on purpose)
 *  - `setup`    something the shop should have and does not yet
 *  - `problem`  it is switched on but cannot work, or keeps failing
 */

export type FeatureState = 'working' | 'ready' | 'off' | 'setup' | 'problem';

export const FEATURE_KEYS = [
  'payments', 'catalogue', 'storeInfo',
  'whatsapp', 'facebook', 'threads', 'posting', 'statusKit', 'share', 'dailyReport', 'tracking', 'domain',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** The basics a shop needs to take an order. Everything else is optional growth. */
export const REQUIRED: readonly FeatureKey[] = ['payments', 'catalogue', 'storeInfo'];

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  payments: 'Payments', catalogue: 'Products', storeInfo: 'Store info', whatsapp: 'WhatsApp connection', facebook: 'Facebook Page', threads: 'Threads',
  posting: 'Auto-posting', statusKit: 'WhatsApp Status', share: 'Share tools', dailyReport: 'Daily report', tracking: 'Ad and analytics tracking', domain: 'Own domain',
};

export type ConnectionFacts = { present: boolean; enabled: boolean; lastError: string | null; lastCheckedAt: Date | null };

export type ShopFacts = {
  paystackReady: boolean;
  paidOrders: number;
  products: { shown: number; shareable: number; noPhoto: number };
  info: { whatsappNumber: boolean; contact: boolean; address: boolean; hours: boolean; tagline: boolean };
  whatsapp: ConnectionFacts & { sent30: number; welcome: boolean };
  facebook: ConnectionFacts & { replies30: number; commentReplies: boolean };
  threads: ConnectionFacts;
  posting: { facebookEnabled: boolean; threadsEnabled: boolean; posted30: number; failed30: number; serverAllows: boolean };
  status: { prepared30: number; posted30: number };
  shares30: number;
  dailyReport: { enabled: boolean; recipients: number };
  tracking: { ga4: boolean; searchConsole: boolean; meta: boolean; tiktok: boolean; x: boolean };
  domain: { custom: boolean; pending: boolean };
};

export type Feature = { key: FeatureKey; label: string; state: FeatureState; detail: string; required: boolean };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const clip = (text: string, max = 110) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A connection is usable when it exists, is switched on and has no saved error. */
function connection(label: string, c: ConnectionFacts, used: number, usedWhat: string, extraOff = ''): { state: FeatureState; detail: string } {
  if (!c.present) return { state: 'off', detail: `Not connected${extraOff}` };
  if (!c.enabled) return { state: 'off', detail: 'Connected, switched off' };
  if (c.lastError) return { state: 'problem', detail: `${label} reports: ${clip(c.lastError)}` };
  if (used > 0) return { state: 'working', detail: usedWhat };
  return { state: 'ready', detail: c.lastCheckedAt ? 'Connected and tested, nothing sent yet' : 'Switched on but never tested' };
}

export function featureCoverage(f: ShopFacts): Feature[] {
  const out: Array<Omit<Feature, 'label' | 'required'>> = [];
  const add = (key: FeatureKey, state: FeatureState, detail: string) => out.push({ key, state, detail });

  // Payments
  if (!f.paystackReady) add('payments', 'setup', 'Card and M-Pesa payments are not connected');
  else if (f.paidOrders > 0) add('payments', 'working', plural(f.paidOrders, 'paid order'));
  else add('payments', 'ready', 'Connected, no paid order yet');

  // Products
  if (f.products.shown === 0) add('catalogue', 'setup', 'No products shown in the shop');
  else if (f.products.shareable === 0) add('catalogue', 'problem', `${plural(f.products.shown, 'product')} shown, but none in stock`);
  else add('catalogue', 'working', `${f.products.shareable} in stock${f.products.noPhoto ? `, ${f.products.noPhoto} without a photo` : ''}`);

  // Store info: a shopper needs a way to reach the shop and know where it is.
  const reachable = f.info.whatsappNumber || f.info.contact;
  if (reachable && (f.info.address || f.info.hours)) add('storeInfo', 'working', 'Contact and location filled in');
  else if (reachable) add('storeInfo', 'ready', 'Contact filled in; no address or opening hours');
  else add('storeInfo', 'setup', 'No WhatsApp number or contact details');

  // WhatsApp Cloud API
  const wa = connection('WhatsApp', f.whatsapp, f.whatsapp.sent30, plural(f.whatsapp.sent30, 'message') + ' sent in 30 days', '; customers still reach the shop through its WhatsApp link');
  add('whatsapp', wa.state, wa.detail);

  // Facebook Page
  const fb = connection('Facebook', f.facebook, f.facebook.replies30, plural(f.facebook.replies30, 'comment') + ' answered in 30 days');
  add('facebook', fb.state, fb.detail);

  // Threads
  const th = connection('Threads', f.threads, f.posting.threadsEnabled ? f.posting.posted30 : 0, 'Connected and posting');
  add('threads', th.state, th.detail);

  // Auto-posting: switched on needs a connection that works and the server's own switch.
  const p = f.posting;
  const onFacebook = p.facebookEnabled; const onThreads = p.threadsEnabled;
  if (!onFacebook && !onThreads) add('posting', 'off', 'Not switched on');
  else if (onFacebook && !(f.facebook.present && f.facebook.enabled)) add('posting', 'problem', 'Posting to the Page is on, but the Page is not connected');
  else if (onThreads && !(f.threads.present && f.threads.enabled)) add('posting', 'problem', 'Posting to Threads is on, but Threads is not connected');
  else if (!p.serverAllows) add('posting', 'problem', 'Switched on for the shop, but off on the whole server');
  else if (p.failed30 >= 3 && p.failed30 > p.posted30) add('posting', 'problem', `${p.failed30} of ${p.failed30 + p.posted30} posts failed in 30 days`);
  else if (p.posted30 > 0) add('posting', 'working', plural(p.posted30, 'post') + ' in 30 days');
  else add('posting', 'ready', 'On, nothing posted yet');

  // WhatsApp Status kit: needs no connection at all; used when pictures were prepared.
  if (f.status.posted30 > 0) add('statusKit', 'working', `${plural(f.status.posted30, 'picture')} posted in 30 days`);
  else if (f.status.prepared30 > 0) add('statusKit', 'ready', 'Pictures prepared, none marked as posted');
  else add('statusKit', 'off', 'Not opened in 30 days');

  // Share tools
  if (f.shares30 > 0) add('share', 'working', plural(f.shares30, 'share') + ' in 30 days');
  else add('share', 'off', 'Not used in 30 days');

  // Daily report
  if (f.dailyReport.enabled && f.dailyReport.recipients > 0) add('dailyReport', 'working', `Going to ${plural(f.dailyReport.recipients, 'recipient')}`);
  else if (f.dailyReport.enabled) add('dailyReport', 'setup', 'On, but no one is set to receive it');
  else add('dailyReport', 'off', 'Not scheduled: no morning report');

  // Tracking
  const trackers = [f.tracking.ga4 && 'Google Analytics', f.tracking.meta && 'Meta', f.tracking.tiktok && 'TikTok', f.tracking.x && 'X', f.tracking.searchConsole && 'Search Console'].filter(Boolean) as string[];
  if (trackers.length) add('tracking', 'working', trackers.join(', '));
  else add('tracking', 'off', 'No pixels or analytics set');

  // Own domain
  if (f.domain.custom) add('domain', 'working', 'Own domain connected');
  else if (f.domain.pending) add('domain', 'setup', 'A domain is waiting for its DNS check');
  else add('domain', 'off', 'Uses the platform address');

  return out.map((o) => ({ ...o, label: FEATURE_LABEL[o.key], required: REQUIRED.includes(o.key) }));
}

export type Coverage = { basics: { done: number; total: number }; extras: { on: number; total: number }; problems: number };

/** "3 of 3 basics, 4 of 9 extras on, 1 problem": the one number a list can sort and filter by. */
export function coverageSummary(features: Feature[]): Coverage {
  const required = features.filter((f) => f.required);
  const optional = features.filter((f) => !f.required);
  return {
    basics: { done: required.filter((f) => f.state === 'working' || f.state === 'ready').length, total: required.length },
    extras: { on: optional.filter((f) => f.state === 'working' || f.state === 'ready').length, total: optional.length },
    problems: features.filter((f) => f.state === 'problem').length,
  };
}

export const isFeatureKey = (v: unknown): v is FeatureKey => (FEATURE_KEYS as readonly string[]).includes(v as string);
export const FEATURE_STATES: readonly FeatureState[] = ['working', 'ready', 'off', 'setup', 'problem'];
export const isFeatureState = (v: unknown): v is FeatureState => (FEATURE_STATES as readonly string[]).includes(v as string);
