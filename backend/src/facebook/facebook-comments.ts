/** One new comment on a Page, from Facebook's `feed` webhook. */
export type FeedComment = {
  commentId: string;
  postId: string | null;
  parentId: string | null;
  pageId: string | null;
  fromId: string | null;
  fromName: string | null;
  message: string | null;
  createdAt: Date | null;
};

/** The new comments in a Page webhook body. Edits, deletions, reactions, posts and everything else are ignored. */
export function parseFeedWebhook(body: any): FeedComment[] {
  const out: FeedComment[] = [];
  if (!body || body.object !== 'page' || !Array.isArray(body.entry)) return out;
  for (const entry of body.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const v = change?.value;
      if (change?.field !== 'feed' || !v || v.item !== 'comment' || v.verb !== 'add' || !v.comment_id) continue;
      const created = Number(v.created_time);
      out.push({
        commentId: String(v.comment_id),
        postId: v.post_id ? String(v.post_id) : null,
        parentId: v.parent_id ? String(v.parent_id) : null,
        pageId: entry?.id ? String(entry.id) : null,
        fromId: v.from?.id ? String(v.from.id) : null,
        fromName: v.from?.name ? String(v.from.name) : null,
        message: typeof v.message === 'string' ? v.message : null,
        createdAt: Number.isFinite(created) && created > 0 ? new Date(created * 1000) : null,
      });
    }
  }
  return out;
}

/** A comment that is a reply to another comment, not to the post. Only the top-level ones are answered. */
export const isReplyToComment = (c: Pick<FeedComment, 'postId' | 'parentId'>) => Boolean(c.parentId && c.postId && c.parentId !== c.postId);

/** Links in a comment are nearly always spam or someone else's advert; those are not answered. */
export const looksLikeSpam = (message: string | null) => Boolean(message && /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co|ke|net|org|io|me|ly)\b\/)/i.test(message));

export const firstName = (name: string | null | undefined) => (name || '').trim().split(/\s+/)[0] || '';

export type ReplyVars = { name?: string | null; shop?: string | null; whatsapp?: string | null; page?: string | null; site?: string | null; location?: string | null };

/**
 * Fills {name}, {shop}, {whatsapp}, {page}, {site} and {location} in a reply text. A missing name reads "there". A **line** that holds a
 * placeholder the shop has no value for is left out entirely, so a shop with no WhatsApp number gets no "chat to us on WhatsApp:" with
 * nothing after it.
 */
export function fillTemplate(template: string, vars: ReplyVars): string {
  const values: Record<string, string> = {
    name: firstName(vars.name) || 'there',
    shop: vars.shop || '',
    whatsapp: vars.whatsapp || '',
    page: vars.page || '',
    site: vars.site || '',
    location: vars.location || '',
  };
  const lines = template.split('\n').filter((line) => {
    const used = [...line.matchAll(/\{(name|shop|whatsapp|page|site|location)\}/g)].map((m) => m[1]);
    return used.every((key) => values[key] !== '');
  });
  return lines
    .join('\n')
    .replace(/\{(name|shop|whatsapp|page|site|location)\}/g, (_, key: string) => values[key])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const DEFAULT_PRIVATE_TEXT =
  "Hi {name}! 👋 Thanks for your interest in {shop}. Reply here with what you'd like and we'll confirm the price and delivery.\n\n💬 WhatsApp: {whatsapp}\n👍 Follow our page for new arrivals and offers: {page}";
export const DEFAULT_PUBLIC_TEXT = "Thanks {name}! 📩 We've sent you a message with the details. Check your Messenger inbox (or Message requests).\n\n🛒 Shop online: {site}\n📍 Visit us: {location}";

/** Facebook errors that mean "try again later" rather than "this will never work": the service is down, rate limited, or the call timed out. */
export function isTransientFacebookError(code: number | null | undefined, status: number | null | undefined): boolean {
  if (status && status >= 500) return true;
  return code === 1 || code === 2 || code === 4 || code === 17 || code === 32 || code === 341 || code === 613;
}

/** Facebook's one-per-comment rule, as it reports it: this comment was already answered privately. */
export const ALREADY_REPLIED_CODES = new Set([10900, 10901, 10903]);
