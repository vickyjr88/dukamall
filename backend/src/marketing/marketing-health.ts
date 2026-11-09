/**
 * What a shop's messaging and posting did over a period, and what in it needs a person. One place decides both, so the owner's morning email and the
 * operator's page across shops always say the same thing about the same shop. Pure: it is given facts and returns words.
 */

export type ConnectionFact = {
  /** A saved connection exists for this provider. */
  present: boolean;
  enabled: boolean;
  lastCheckedAt: Date | null;
  lastError: string | null;
  tokenExpiresAt: Date | null;
};

export type ShopMessagingFacts = {
  whatsapp: ConnectionFact;
  facebook: ConnectionFact;
  threads: ConnectionFact;
  features: { welcomeSeries: boolean; commentReplies: boolean; postFacebook: boolean; postThreads: boolean };
  /** The server-wide switch for posting (SOCIAL_POSTING=false turns it off for everyone). */
  postingAllowed: boolean;
  whatsappActivity: { sent: number; failed: number; delivered: number; topFailure: string | null; newPeople: number; optOuts: number };
  comments: { sent: number; failed: number; skipped: number; topFailure: string | null };
  posts: { facebook: PostTally; threads: PostTally };
  status: { prepared: number; posted: number };
};

export type PostTally = { posted: number; failed: number; topFailure: string | null };

export type Severity = 'problem' | 'warn';
export type AttentionItem = { key: string; severity: Severity; text: string };

const DAY_MS = 86_400_000;
/** A Threads login lasts 60 days and renews itself while posting is on; this is how long before the end it is worth saying so. */
export const TOKEN_WARN_DAYS = 14;
/** Too few messages say nothing about a failure rate: three failures of four is noise, not a trend. */
export const MIN_SENT_FOR_RATE = 5;

const clip = (text: string | null | undefined, max = 140) => {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const because = (reason: string | null) => (reason ? `: ${clip(reason)}` : '');

/** The connections' own state: a saved error, a login that has ended or is about to, one never tested, a feature switched on with nothing to run on. */
function connectionItems(f: ShopMessagingFacts, now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  const named: Array<[string, string, ConnectionFact]> = [['whatsapp', 'WhatsApp', f.whatsapp], ['facebook', 'Facebook Page', f.facebook], ['threads', 'Threads', f.threads]];
  for (const [key, label, c] of named) {
    if (!c.present || !c.enabled) continue;
    if (c.lastError) items.push({ key: `${key}-error`, severity: 'problem', text: `${label} reports a problem${because(c.lastError)}. Open Connections and press Test connection.` });
    else if (!c.lastCheckedAt) items.push({ key: `${key}-untested`, severity: 'warn', text: `${label} is switched on but has never been tested. Open Connections and press Test connection.` });
  }
  if (f.threads.present && f.threads.enabled && f.threads.tokenExpiresAt) {
    const days = Math.floor((f.threads.tokenExpiresAt.getTime() - now.getTime()) / DAY_MS);
    if (days < 0) items.push({ key: 'threads-expired', severity: 'problem', text: 'The Threads login has ended, so nothing can be posted there. Make a new token and paste it under Connections.' });
    else if (days <= TOKEN_WARN_DAYS) {
      items.push({ key: 'threads-expiring', severity: 'warn', text: `The Threads login ends in ${plural(days, 'day')}. It renews itself while posting to Threads is on; if posting is off, paste a new token under Connections.` });
    }
  }
  const on = (c: ConnectionFact) => c.present && c.enabled;
  if (f.features.welcomeSeries && !on(f.whatsapp)) items.push({ key: 'welcome-no-whatsapp', severity: 'problem', text: 'Welcoming people who message you is on, but WhatsApp is not connected, so no one is being welcomed.' });
  if (f.features.commentReplies && !on(f.facebook)) items.push({ key: 'comments-no-facebook', severity: 'problem', text: 'Replying to Page comments is on, but the Facebook Page is not connected, so no one is being answered.' });
  if (f.features.postFacebook && !on(f.facebook)) items.push({ key: 'post-facebook-no-connection', severity: 'problem', text: 'Posting to the Facebook Page is on, but the Page is not connected, so nothing is being posted.' });
  if (f.features.postThreads && !on(f.threads)) items.push({ key: 'post-threads-no-connection', severity: 'problem', text: 'Posting to Threads is on, but Threads is not connected, so nothing is being posted.' });
  if (!f.postingAllowed && (f.features.postFacebook || f.features.postThreads)) {
    items.push({ key: 'posting-off-on-server', severity: 'warn', text: 'Posting is switched on for this shop, but it is switched off on the whole server, so nothing is being posted.' });
  }
  return items;
}

/** What went wrong in the period itself: a high share of failed messages, failed comment replies, posts that did not go. */
function activityItems(f: ShopMessagingFacts): AttentionItem[] {
  const items: AttentionItem[] = [];
  const w = f.whatsappActivity;
  const tried = w.sent + w.failed;
  if (tried >= MIN_SENT_FOR_RATE && w.failed / tried >= 0.2) {
    items.push({ key: 'whatsapp-failures', severity: 'problem', text: `${w.failed} of ${plural(tried, 'WhatsApp message')} did not reach people${because(w.topFailure)}.` });
  }
  const c = f.comments;
  const answered = c.sent + c.failed;
  if (c.failed >= 3 && c.failed >= answered / 2) {
    items.push({ key: 'comment-failures', severity: 'problem', text: `${plural(c.failed, 'comment')} on your Page could not be answered${because(c.topFailure)}.` });
  }
  for (const [key, label, p] of [['facebook', 'the Facebook Page', f.posts.facebook], ['threads', 'Threads', f.posts.threads]] as const) {
    if (p.failed === 0) continue;
    const allFailed = p.posted === 0;
    items.push({ key: `post-${key}-failures`, severity: allFailed ? 'problem' : 'warn', text: `${plural(p.failed, 'post')} to ${label} did not go out${allFailed ? ' (none did)' : ''}${because(p.topFailure)}.` });
  }
  return items;
}

/** Everything that needs a person, worst first. Empty means nothing does. */
export function attentionFor(f: ShopMessagingFacts, now: Date): AttentionItem[] {
  const all = [...connectionItems(f, now), ...activityItems(f)];
  return all.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'problem' ? -1 : 1));
}

/** Whether the shop uses any of it at all: a connection, a feature on, or something done in the period. Shops that do not are left out of the owner's email. */
export function usesMessaging(f: ShopMessagingFacts): boolean {
  const a = f.whatsappActivity;
  return f.whatsapp.present || f.facebook.present || f.threads.present
    || Object.values(f.features).some(Boolean)
    || a.sent + a.failed + a.newPeople + a.optOuts > 0
    || f.comments.sent + f.comments.failed > 0
    || f.posts.facebook.posted + f.posts.facebook.failed + f.posts.threads.posted + f.posts.threads.failed > 0
    || f.status.prepared > 0;
}

/** The worst severity among the items, for sorting and colouring. */
export function worst(items: AttentionItem[]): Severity | null {
  return items.some((i) => i.severity === 'problem') ? 'problem' : items.length ? 'warn' : null;
}
