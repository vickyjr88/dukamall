/**
 * Links and words for sharing a product from the portal: the same rules Drip Emporium's Share page follows, as pure functions so they can
 * be tested. The link says where it was shared (`utm_source`) and that a shop owner shared it (`utm_campaign`), so Analytics > Visits & ads
 * counts the visits by channel, and a sale can be traced to the post that brought it.
 *
 * Nothing is posted for anyone: WhatsApp and the social networks give a website no way to do that, so this opens their own share screens
 * and a person presses send.
 */

export const SHARE_CHANNELS = ['whatsapp', 'facebook', 'x', 'telegram', 'share', 'link'] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

/** What a tap is recorded as: the channels above, or `download` for a picture saved to post by hand. */
export const RECORD_CHANNELS = [...SHARE_CHANNELS, 'download'] as const;
export const SHARE_KINDS = ['PRODUCT', 'CATALOGUE', 'LINK', 'QR'] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/** A utm value: lower case letters, digits, dash and underscore only, so a typo or a pasted sentence cannot break the address. */
export function cleanTag(value: unknown, fallback = ''): string {
  const tag = String(value ?? '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return tag || fallback;
}

export function tagLink(base: string, tags: { source: string; medium?: string; campaign?: string }): string {
  const url = new URL(base);
  url.searchParams.set('utm_source', cleanTag(tags.source, 'share'));
  url.searchParams.set('utm_medium', cleanTag(tags.medium, 'social'));
  url.searchParams.set('utm_campaign', cleanTag(tags.campaign, 'shop-share'));
  return url.toString();
}

/**
 * A path on the shop's own site, from something the owner typed: it must start with one slash and stay on the shop (no "//host", no scheme,
 * no backslash, no dots that climb out). Anything else is refused rather than guessed at.
 */
export function safePath(input: unknown): string | null {
  const path = String(input ?? '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\s]/.test(path) || /\.\./.test(path) || /^\/[a-z][a-z0-9+.-]*:/i.test(path)) return null;
  return path.length > 300 ? null : path;
}

export function priceText(input: { minKes: number | null; maxKes: number | null; wasKes?: number | null; currency?: string }): string {
  const cur = input.currency || 'KES';
  if (input.minKes === null) return '';
  const fmt = (n: number) => n.toLocaleString('en-KE');
  const base = input.minKes === input.maxKes || input.maxKes === null ? `${cur} ${fmt(input.minKes)}` : `From ${cur} ${fmt(input.minKes)}`;
  return input.wasKes && input.wasKes > input.minKes ? `${base} (was ${fmt(input.wasKes)})` : base;
}

/** What a message says for one product: the name, the price, the link. */
export function productMessage(input: { name: string; priceText: string; link: string }): string {
  return [input.name, input.priceText].filter(Boolean).join('\n') + `\n\n🛒 ${input.link}`;
}

/**
 * Several products in one message, for a WhatsApp group or broadcast: one line each with its price and its own link, then the shop's address.
 * Capped so the message stays readable and under what WhatsApp will open from a link.
 */
export const CATALOGUE_MAX = 12;
export function catalogueMessage(input: { shopName: string; items: Array<{ name: string; priceText: string; link: string }>; shopLink: string }): string {
  const lines = input.items.slice(0, CATALOGUE_MAX).map((it, i) => `${i + 1}. ${it.name}${it.priceText ? ` - ${it.priceText}` : ''}\n   ${it.link}`);
  return `New at ${input.shopName}\n\n${lines.join('\n\n')}\n\nSee everything: ${input.shopLink}`;
}

/** The address that opens a channel's own share screen with the message ready; null for the phone's share sheet and a copied link, which happen in the browser. */
export function channelHref(channel: ShareChannel, input: { link: string; text: string; message: string }): string | null {
  const link = encodeURIComponent(input.link);
  const text = encodeURIComponent(input.text);
  switch (channel) {
    case 'whatsapp': return `https://wa.me/?text=${encodeURIComponent(input.message)}`;
    case 'facebook': return `https://www.facebook.com/sharer/sharer.php?u=${link}`;
    case 'x': return `https://twitter.com/intent/tweet?text=${text}&url=${link}`;
    case 'telegram': return `https://t.me/share/url?url=${link}&text=${text}`;
    default: return null;
  }
}

export const isRecordChannel = (v: unknown): v is (typeof RECORD_CHANNELS)[number] => (RECORD_CHANNELS as readonly string[]).includes(v as string);
export const isShareKind = (v: unknown): v is ShareKind => (SHARE_KINDS as readonly string[]).includes(v as string);
