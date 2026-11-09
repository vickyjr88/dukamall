/**
 * The messages the owner can send a customer, and the welcome series. Each is an approved WhatsApp template in the SHOP's own WhatsApp
 * Business Account, named in the shop's WhatsApp connection (Portal > Connections), because every shop has its own number and templates.
 *
 * Two have two variables: {{1}} the customer's first name and {{2}} a link (the group invite, the Google review link). The link is a
 * variable so it can change without sending the template back to Meta for review. (A variable cannot be the first or last thing in a
 * template body, so write a closing sentence.) Two more are fixed text with no variables.
 */
export type OutreachKind = 'GROUP' | 'REVIEW' | 'LOCATION' | 'RANGE';

export const OUTREACH_KINDS: OutreachKind[] = ['GROUP', 'REVIEW', 'LOCATION', 'RANGE'];

/** Templates whose text is complete as approved: they take no name and no link. */
export const FIXED_TEXT_KINDS: OutreachKind[] = ['LOCATION', 'RANGE'];
export const hasVariables = (kind: OutreachKind): boolean => !FIXED_TEXT_KINDS.includes(kind);

export const KIND_LABELS: Record<OutreachKind, string> = {
  GROUP: 'Join the WhatsApp group',
  REVIEW: 'Rate us on Google',
  LOCATION: 'Where to find us',
  RANGE: 'What we sell',
};

export const isKind = (value: unknown): value is OutreachKind => OUTREACH_KINDS.includes(value as OutreachKind);

/** The welcome series, in order. A step the shop has no link for is skipped at send time. */
export const SEQUENCE: OutreachKind[] = ['GROUP', 'REVIEW'];

/** Hours before each welcome message: the first waits a day after the notice, the second two days after the first. */
export const SEQUENCE_DELAYS_HOURS = [24, 48];

const DEFAULT_TEMPLATES: Partial<Record<OutreachKind, string>> = { GROUP: 'join_group', REVIEW: 'rate_us' };
const TEMPLATE_KEYS: Record<OutreachKind, string> = { GROUP: 'templateGroup', REVIEW: 'templateReview', LOCATION: 'templateLocation', RANGE: 'templateRange' };

/** The template for a message, from the shop's WhatsApp settings. Null for a fixed-text message the shop has not named a template for. */
export const templateFor = (kind: OutreachKind, config: Record<string, string>): string | null => config[TEMPLATE_KEYS[kind]] || DEFAULT_TEMPLATES[kind] || null;

/** Only web links are sent: whatever the shop stored is used in a message to a customer. */
export const safeUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

/** First name for "Hi {{1}}", or "there" when it is missing or is really a phone number or an email. */
export const greetingName = (name: string | null | undefined): string => {
  const word = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!word || /\d/.test(word) || word.includes('@')) return 'there';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
};

/** How the shop has set up WhatsApp, from its connection's settings. Features start off. */
export function whatsappSettings(config: Record<string, string>) {
  const cap = Number(config.dailySendCap);
  return {
    autoSubscribe: config.autoSubscribe === 'true',
    // Meta limits a business that is not verified to about 250 conversations a day; never exceed that whatever is typed.
    dailySendCap: Number.isFinite(cap) && cap > 0 ? Math.min(cap, 1000) : 200,
  };
}
