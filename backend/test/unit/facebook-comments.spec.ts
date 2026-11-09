import {
  ALREADY_REPLIED_CODES, DEFAULT_PRIVATE_TEXT, DEFAULT_PUBLIC_TEXT, fillTemplate, isReplyToComment, isTransientFacebookError, looksLikeSpam, parseFeedWebhook,
} from '../../src/facebook/facebook-comments';
import { PROVIDERS, cleanInput } from '../../src/integrations/integration-providers';

const feed = (value: any, pageId = '111') => ({ object: 'page', entry: [{ id: pageId, time: 1793900000, changes: [{ field: 'feed', value }] }] });
const comment = (over: any = {}) => ({ item: 'comment', verb: 'add', comment_id: '111_900_1', post_id: '111_900', parent_id: '111_900', created_time: 1793900000, message: 'How much is the Seiko 5?', from: { id: '555', name: 'Wanjiru Kamau' }, ...over });

describe('what Facebook sends', () => {
  it('only new comments are taken from a Page event; edits, reactions, posts and other objects are ignored', () => {
    const got = parseFeedWebhook(feed(comment()));
    expect(got.map((c) => [c.commentId, c.postId, c.pageId, c.fromId, c.fromName, c.message])).toEqual([['111_900_1', '111_900', '111', '555', 'Wanjiru Kamau', 'How much is the Seiko 5?']]);
    expect(got[0].createdAt!.getTime()).toBe(1793900000 * 1000);
    for (const ignored of [comment({ verb: 'edited' }), comment({ verb: 'remove' }), comment({ item: 'reaction' }), comment({ item: 'status' }), comment({ comment_id: undefined })]) expect(parseFeedWebhook(feed(ignored))).toEqual([]);
    for (const bad of [null, {}, { object: 'whatsapp_business_account', entry: [] }, { object: 'page', entry: 'x' }, { object: 'page', entry: [{ changes: [{ field: 'mention', value: comment() }] }] }]) expect(parseFeedWebhook(bad)).toEqual([]);
  });

  it('knows a reply to another comment, and a comment with a link', () => {
    expect(isReplyToComment({ postId: '111_900', parentId: '111_900' })).toBe(false);
    expect(isReplyToComment({ postId: '111_900', parentId: '111_900_5' })).toBe(true);
    for (const spam of ['check https://x.com/win', 'visit www.deals.co.ke', 'shop at best-watches.com/offer']) expect(looksLikeSpam(spam)).toBe(true);
    for (const fine of ['How much is it?', 'Price? 0712345678', null]) expect(looksLikeSpam(fine as any)).toBe(false);
  });

  it('separates a Facebook outage from a refusal, and knows the "already answered" codes', () => {
    expect(isTransientFacebookError(2, 500)).toBe(true);
    expect(isTransientFacebookError(4, 400)).toBe(true);
    expect(isTransientFacebookError(200, 403)).toBe(false);
    expect(isTransientFacebookError(10900, 400)).toBe(false);
    expect([10900, 10901, 10903].every((c) => ALREADY_REPLIED_CODES.has(c))).toBe(true);
  });
});

describe('the reply wording is the shop\'s own', () => {
  const all = { name: 'Wanjiru Kamau', shop: 'Nairobi Gents', whatsapp: 'https://wa.me/254113206481', page: 'https://www.facebook.com/nairobigents', site: 'https://nairobigents.shops.test', location: 'Moi Avenue, Nairobi' };

  it('names the shop, greets by first name, and carries its links', () => {
    const text = fillTemplate(DEFAULT_PRIVATE_TEXT, all);
    expect(text).toMatch(/^Hi Wanjiru! 👋 Thanks for your interest in Nairobi Gents\./);
    expect(text).toContain('💬 WhatsApp: https://wa.me/254113206481');
    expect(text).toContain('👍 Follow our page for new arrivals and offers: https://www.facebook.com/nairobigents');
    expect(text).not.toContain('Drip Emporium');
    const pub = fillTemplate(DEFAULT_PUBLIC_TEXT, all);
    expect(pub).toContain('🛒 Shop online: https://nairobigents.shops.test');
    expect(pub).toContain('📍 Visit us: Moi Avenue, Nairobi');
  });

  it('leaves out a whole line the shop has no value for, instead of a label with nothing after it', () => {
    const text = fillTemplate(DEFAULT_PRIVATE_TEXT, { ...all, whatsapp: '' });
    expect(text).not.toContain('WhatsApp');
    expect(text).toContain('Follow our page');
    expect(text).not.toMatch(/:\s*$/m);
    const pub = fillTemplate(DEFAULT_PUBLIC_TEXT, { ...all, location: '', site: '' });
    expect(pub).toBe("Thanks Wanjiru! 📩 We've sent you a message with the details. Check your Messenger inbox (or Message requests).");
  });

  it('a missing name reads "there", and an owner\'s own wording works the same way', () => {
    expect(fillTemplate('Hi {name}!', { name: null })).toBe('Hi there!');
    expect(fillTemplate('Hi {name}, {shop} here.\nOrder: {site}', { name: 'Amina Yusuf', shop: 'Phone Hub', site: '' })).toBe('Hi Amina, Phone Hub here.');
    expect(fillTemplate('No placeholders at all', {})).toBe('No placeholders at all');
  });
});

describe('the Facebook connection\'s settings', () => {
  const fields = Object.fromEntries(PROVIDERS.FACEBOOK.fields.map((f) => [f.key, f]));

  it('start off, so nothing is said on the shop\'s Page until the owner turns it on', () => {
    expect(fields.commentReplies).toMatchObject({ input: 'toggle', default: 'false', kind: 'config' });
    expect(fields.publicReply).toMatchObject({ input: 'toggle', default: 'true' });
    expect(fields.replyDailyCap).toMatchObject({ input: 'number', default: '200' });
    expect(fields.privateReplyText.input).toBe('textarea');
    expect(fields.publicReplyText.input).toBe('textarea');
  });

  it('accepts the owner\'s wording up to 1000 characters and refuses more, or a switch that is not on or off', () => {
    expect(cleanInput('FACEBOOK', { config: { privateReplyText: 'Hi {name}!\nThanks for asking about {shop}.' } }).config.privateReplyText).toContain('{shop}');
    expect(() => cleanInput('FACEBOOK', { config: { privateReplyText: 'x'.repeat(1001) } })).toThrow(/Private message wording/);
    expect(() => cleanInput('FACEBOOK', { config: { commentReplies: 'maybe' } })).toThrow(/does not look right/);
  });
});
