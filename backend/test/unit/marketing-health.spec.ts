import { ShopMessagingFacts, attentionFor, usesMessaging, worst } from '../../src/marketing/marketing-health';
import { renderEmail } from '../../src/daily-report/daily-report.render';
import type { DailyReport } from '../../src/daily-report/daily-report.types';

const NOW = new Date('2026-11-09T07:00:00Z');
const DAY = 86_400_000;
const off = { present: false, enabled: false, lastCheckedAt: null, lastError: null, tokenExpiresAt: null };
const on = (over: Record<string, unknown> = {}) => ({ present: true, enabled: true, lastCheckedAt: new Date('2026-11-01T00:00:00Z'), lastError: null, tokenExpiresAt: null, ...over });
const post = { posted: 0, failed: 0, topFailure: null };
const facts = (over: Partial<ShopMessagingFacts> = {}): ShopMessagingFacts => ({
  whatsapp: off, facebook: off, threads: off,
  features: { welcomeSeries: false, commentReplies: false, postFacebook: false, postThreads: false },
  postingAllowed: true,
  whatsappActivity: { sent: 0, failed: 0, delivered: 0, topFailure: null, newPeople: 0, optOuts: 0 },
  comments: { sent: 0, failed: 0, skipped: 0, topFailure: null },
  posts: { facebook: post, threads: post },
  status: { prepared: 0, posted: 0 },
  ...over,
});
const keys = (f: ShopMessagingFacts) => attentionFor(f, NOW).map((i) => i.key);

describe('a shop that uses none of it', () => {
  it('has nothing to attend to and is left out of the owner’s email', () => {
    expect(attentionFor(facts(), NOW)).toEqual([]);
    expect(usesMessaging(facts())).toBe(false);
  });
  it.each<[string, Partial<ShopMessagingFacts>]>([
    ['a connection', { facebook: on() }],
    ['a feature switched on', { features: { welcomeSeries: false, commentReplies: false, postFacebook: true, postThreads: false } }],
    ['messages sent', { whatsappActivity: { sent: 1, failed: 0, delivered: 0, topFailure: null, newPeople: 0, optOuts: 0 } }],
    ['a person who messaged', { whatsappActivity: { sent: 0, failed: 0, delivered: 0, topFailure: null, newPeople: 1, optOuts: 0 } }],
    ['a comment answered', { comments: { sent: 1, failed: 0, skipped: 0, topFailure: null } }],
    ['a post', { posts: { facebook: { posted: 1, failed: 0, topFailure: null }, threads: post } }],
    ['a Status kit', { status: { prepared: 3, posted: 0 } }],
  ])('uses it when there is %s', (_l, over) => expect(usesMessaging(facts(over))).toBe(true));
});

describe('the connections themselves', () => {
  it('a switched-on connection with a saved error is a problem, with the reason and where to fix it', () => {
    const [item] = attentionFor(facts({ whatsapp: on({ lastError: 'Invalid OAuth access token' }) }), NOW);
    expect(item).toMatchObject({ key: 'whatsapp-error', severity: 'problem' });
    expect(item.text).toContain('Invalid OAuth access token');
    expect(item.text).toContain('Test connection');
  });
  it('one that is switched off, or has never been saved, is not reported', () => {
    expect(keys(facts({ whatsapp: on({ enabled: false, lastError: 'x' }), facebook: off }))).toEqual([]);
  });
  it('one switched on and never tested is a warning, not a problem', () => {
    expect(attentionFor(facts({ threads: on({ lastCheckedAt: null }) }), NOW)).toEqual([expect.objectContaining({ key: 'threads-untested', severity: 'warn' })]);
  });
  it('a Threads login that has ended is a problem; one ending within two weeks is a warning; a later one is fine', () => {
    const at = (days: number) => keys(facts({ threads: on({ tokenExpiresAt: new Date(NOW.getTime() + days * DAY) }) }));
    expect(at(-1)).toEqual(['threads-expired']);
    expect(at(10)).toEqual(['threads-expiring']);
    expect(at(14)).toEqual(['threads-expiring']);
    expect(at(15)).toEqual([]);
    expect(attentionFor(facts({ threads: on({ tokenExpiresAt: new Date(NOW.getTime() + 3 * DAY) }) }), NOW)[0].text).toContain('3 days');
    expect(attentionFor(facts({ threads: on({ tokenExpiresAt: new Date(NOW.getTime() + 1.5 * DAY) }) }), NOW)[0].text).toContain('1 day.');
  });
  it('a Threads login is not reported once Threads is switched off', () => {
    expect(keys(facts({ threads: on({ enabled: false, tokenExpiresAt: new Date(NOW.getTime() - DAY) }) }))).toEqual([]);
  });
  it('a feature that is on with nothing connected is a problem, one for each', () => {
    const f = facts({ features: { welcomeSeries: true, commentReplies: true, postFacebook: true, postThreads: true } });
    expect(keys(f).sort()).toEqual(['comments-no-facebook', 'post-facebook-no-connection', 'post-threads-no-connection', 'welcome-no-whatsapp']);
    expect(attentionFor(f, NOW).every((i) => i.severity === 'problem')).toBe(true);
  });
  it('the same features are fine once connected', () => {
    expect(keys(facts({ whatsapp: on(), facebook: on(), threads: on(), features: { welcomeSeries: true, commentReplies: true, postFacebook: true, postThreads: true } }))).toEqual([]);
  });
  it('posting switched off on the whole server is said, but only to a shop that has posting on', () => {
    const f = facts({ facebook: on(), postingAllowed: false, features: { welcomeSeries: false, commentReplies: false, postFacebook: true, postThreads: false } });
    expect(keys(f)).toEqual(['posting-off-on-server']);
    expect(keys(facts({ postingAllowed: false }))).toEqual([]);
  });
});

describe('what went wrong in the period', () => {
  const wa = (sent: number, failed: number, topFailure: string | null = null) => facts({ whatsappActivity: { sent, failed, delivered: 0, topFailure, newPeople: 0, optOuts: 0 } });
  it('a high share of WhatsApp messages not reaching people is a problem, with the commonest reason', () => {
    const [item] = attentionFor(wa(8, 2, '131042: payment method'), NOW);
    expect(item).toMatchObject({ key: 'whatsapp-failures', severity: 'problem' });
    expect(item.text).toContain('2 of 10 WhatsApp messages');
    expect(item.text).toContain('131042');
  });
  it('a few failures, or too few messages to tell, are not', () => {
    expect(keys(wa(9, 1))).toEqual([]);
    expect(keys(wa(0, 4))).toEqual([]);
    expect(keys(wa(1, 3))).toEqual([]);
    expect(keys(wa(0, 5))).toEqual(['whatsapp-failures']);
  });
  it('a very long reason is cut, not pasted whole', () => {
    expect(attentionFor(wa(0, 6, 'x'.repeat(500)), NOW)[0].text.length).toBeLessThan(260);
  });
  it('comments that could not be answered', () => {
    const c = (sent: number, failed: number) => facts({ comments: { sent, failed, skipped: 0, topFailure: 'Missing permission' } });
    expect(keys(c(10, 2))).toEqual([]);
    expect(keys(c(10, 3))).toEqual([]); // 3 of 13 is not half
    expect(keys(c(1, 3))).toEqual(['comment-failures']);
    expect(attentionFor(c(0, 4), NOW)[0].text).toContain('Missing permission');
  });
  it('posts that did not go: a warning when others did, a problem when none did', () => {
    const f = (posted: number, failed: number) => facts({ posts: { facebook: { posted, failed, topFailure: 'Meta refused the picture' }, threads: post } });
    expect(attentionFor(f(2, 1), NOW)[0]).toMatchObject({ key: 'post-facebook-failures', severity: 'warn' });
    expect(attentionFor(f(0, 1), NOW)[0]).toMatchObject({ severity: 'problem' });
    expect(attentionFor(f(0, 1), NOW)[0].text).toContain('(none did)');
    expect(keys(f(3, 0))).toEqual([]);
  });
  it('problems come before warnings', () => {
    const items = attentionFor(facts({ threads: on({ lastCheckedAt: null }), whatsapp: on({ lastError: 'bad' }) }), NOW);
    expect(items.map((i) => i.severity)).toEqual(['problem', 'warn']);
    expect(worst(items)).toBe('problem');
    expect(worst(items.slice(1))).toBe('warn');
    expect(worst([])).toBeNull();
  });
});

describe('the section in the owner’s morning email', () => {
  const report = (messaging: ShopMessagingFacts & { shopId: string; used: boolean; attention: any[] } | null): DailyReport => ({
    shopName: 'Nairobi Gents', currency: 'KES', dateKey: '2026-11-08', label: 'Sun 8 Nov 2026', generatedAt: NOW.toISOString(),
    today: { placed: 1, cancelled: 0, unpaid: 0, paidOrders: 1, revenue: 1000, items: 1, averageOrder: 1000, discounts: 0, discountedOrders: 0 },
    vsPreviousDay: { label: 'day before', revenue: 0, orders: 0, revenueChange: null, ordersChange: null },
    vsLastWeek: { label: 'Sun', revenue: 0, orders: 0, revenueChange: null, ordersChange: null },
    orders: [], ordersOmitted: 0, needsAction: { awaitingShipment: { count: 0, oldest: [] }, unpaidOver24h: { count: 0, value: 0, oldest: [] } },
    topSellers: [], stock: { soldOut: [], low: [] }, demand: { abandonedCarts: 0, abandonedValue: 0, whatsappOrderLeads: 0, newCustomers: 0 },
    bySource: [], byPayment: [], catalogue: { activeProducts: 1, missingPhoto: 0, feedItems: 1, noStockAnywhere: 0, syncedAwaitingStock: 0 }, messaging,
  });
  const messaging = (over: Partial<ShopMessagingFacts>, attention: any[] = []) => { const f = facts(over); return { ...f, shopId: 's', used: usesMessaging(f), attention }; };

  it('is absent for a shop that uses none of it, and when there is no data', () => {
    expect(renderEmail(report(null)).html).not.toContain('Messaging and posting');
    expect(renderEmail({ ...report(null), messaging: undefined }).html).not.toContain('Messaging and posting');
  });
  it('says what happened, with only the lines that apply, and that nothing needs you', () => {
    const { html } = renderEmail(report(messaging({
      whatsapp: on(), facebook: on(), features: { welcomeSeries: true, commentReplies: true, postFacebook: true, postThreads: false },
      whatsappActivity: { sent: 12, failed: 0, delivered: 11, topFailure: null, newPeople: 4, optOuts: 1 },
      comments: { sent: 5, failed: 0, skipped: 1, topFailure: null }, posts: { facebook: { posted: 3, failed: 0, topFailure: null }, threads: post }, status: { prepared: 3, posted: 2 },
    })));
    expect(html).toContain('Messaging and posting');
    expect(html).toContain('WhatsApp messages sent');
    expect(html).toContain('11 delivered');
    expect(html).toContain('4 new');
    expect(html).toContain('1 opted out');
    expect(html).toContain('Page comments answered');
    expect(html).toContain('Facebook Page posts');
    expect(html).not.toContain('Threads posts'); // Threads was never switched on
    expect(html).toContain('3 ready');
    expect(html).toContain('2 posted by hand');
    expect(html).toContain('Nothing here needs you.');
  });
  it('lists what needs attention, problems in red, and escapes anything from outside', () => {
    const { html } = renderEmail(report(messaging({ whatsapp: on() }, [
      { key: 'a', severity: 'problem', text: 'Reason: <script>alert(1)</script>' }, { key: 'b', severity: 'warn', text: 'A warning' },
    ])));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A warning');
    expect(html).toContain('#b3261e');
    expect(html).not.toContain('Nothing here needs you.');
  });
  it('shows failures in red next to the count', () => {
    const { html } = renderEmail(report(messaging({ whatsapp: on(), whatsappActivity: { sent: 3, failed: 7, delivered: 1, topFailure: null, newPeople: 0, optOuts: 0 } })));
    expect(html).toContain('7 failed');
  });
});
