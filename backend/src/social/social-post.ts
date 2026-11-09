import { createHash } from 'crypto';

/** One kind of option a product comes in, with the values that are in stock now: Size 40-44, Colour Black/White, Storage 128GB/256GB. */
export type OptionGroup = { key: string; label: string; values: string[] };

/** What the engine needs to know about a product that could be posted. Built from the shop's own catalogue. */
export type PostableProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  /** The shop's section for it: footwear, clothes, watches, electronics or devices. Decides how it is described. */
  section: string | null;
  imageUrl: string;
  priceFrom: number;
  priceTo: number;
  /** The best sale price right now, when one is running. */
  offer: { price: number; was: number } | null;
  /** The options that are in stock, in the order the shop entered them. Empty for a product that comes in one form (most watches). */
  options: OptionGroup[];
  stockUnits: number;
  createdAt: Date;
};

export type PostContext = { shopName: string; origin: string; whatsapp: string; location: string };

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const hash = (text: string) => createHash('sha256').update(text).digest().readUInt32BE(0);

/** Opening lines. One is chosen per product and day, so the Page does not read like the same post repeated. */
const OPENERS = [
  'Pick of the day ✨',
  'Still available 👀',
  'Fresh in stock 🔥',
  'Have you seen this one? 😍',
  'Ready when you are 🛍️',
  'Straight from our shelf 💯',
  'New on the shelf 🆕',
];

/** A product's own page, tagged so Insights counts the visit as coming from that channel, by the engine (campaign `autopost`). */
export function postLink(origin: string, slug: string, channel: 'facebook' | 'threads'): string {
  return `${origin.replace(/\/+$/, '')}/shop/${slug}?utm_source=${channel}&utm_medium=social&utm_campaign=autopost`;
}

/**
 * Sizes as short as they can be read: ["EUR 36","EUR 37","EUR 38","EUR 41"] -> "EUR 36–38, 41". Numbers that follow each other are a range, a shared
 * prefix ("EUR ") is said once, and anything that is not a number (S, M, L) is kept as it is, in the order given.
 */
export function compactSizes(sizes: string[]): string {
  const unique = [...new Set(sizes.map((s) => s.trim()).filter(Boolean))];
  const parsed = unique.map((s) => /^(.*?)(\d+)$/.exec(s));
  if (!unique.length) return '';
  const prefix = parsed[0]?.[1] ?? '';
  if (parsed.some((m) => !m || m[1] !== prefix)) return unique.join(', ');
  const numbers = parsed.map((m) => Number(m![2])).sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < numbers.length; ) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j += 1;
    runs.push(j > i ? `${numbers[i]}–${numbers[j]}` : String(numbers[i]));
    i = j + 1;
  }
  return `${prefix}${runs.join(', ')}`;
}

const ICONS: Record<string, string> = { size: '📏', colour: '🎨', storage: '💾', condition: '🏷️' };
const MAX_VALUES = 8;

/** One readable line for a kind of option: "📏 Sizes: EUR 36–39, 41–44", "🎨 Colours: Black, White", "💾 Storage: 128GB, 256GB". */
function optionLine(group: OptionGroup): string | null {
  const values = [...new Set(group.values.map((v) => v.trim()).filter(Boolean))];
  if (!values.length) return null;
  const label = group.key === 'size' ? (values.length > 1 ? 'Sizes' : 'Size') : group.key === 'colour' ? (values.length > 1 ? 'Colours' : 'Colour') : group.label;
  const shown = group.key === 'size'
    ? compactSizes(values)
    : values.length > MAX_VALUES ? `${values.slice(0, MAX_VALUES).join(', ')} and more` : values.join(', ');
  return `${ICONS[group.key] ?? '▫️'} ${label}: ${shown}`;
}

/** The option lines for a product: none for something that comes in one form. */
export const optionLines = (options: OptionGroup[]): string[] => options.map(optionLine).filter((l): l is string => Boolean(l));

const priceLine = (p: PostableProduct) =>
  p.offer ? `🔥 ${kes(p.offer.price)} (was ${kes(p.offer.was)})` : p.priceFrom === p.priceTo || !p.priceTo ? `💰 ${kes(p.priceFrom)}` : `💰 From ${kes(p.priceFrom)}`;

const SECTION_TAG: Record<string, string> = { footwear: '#Shoes', clothes: '#Fashion', watches: '#Watches', electronics: '#Electronics', devices: '#Phones' };
const tagOf = (text: string) => text.replace(/[^A-Za-z0-9]/g, '');

/** Hashtags from the shop's own name, what kind of thing it is, and its brand. */
export function hashtags(p: PostableProduct, shopName: string): string {
  const own = tagOf(shopName);
  return [own ? `#${own}` : '', p.section ? SECTION_TAG[p.section] ?? '' : '', p.brand && tagOf(p.brand) ? `#${tagOf(p.brand)}` : ''].filter(Boolean).join(' ');
}

/** The Facebook post text. Same facts every time (name, price, what is in stock, how to buy), a different opening by product and day. */
export function buildCaption(product: PostableProduct, ctx: PostContext, day: string): string {
  const opener = OPENERS[hash(`${product.id}:${day}`) % OPENERS.length];
  const lines = [
    opener,
    '',
    product.name,
    priceLine(product),
    ...optionLines(product.options),
    '',
    `🛒 Order online: ${postLink(ctx.origin, product.slug, 'facebook')}`,
    ctx.whatsapp ? `💬 WhatsApp: ${ctx.whatsapp}` : null,
    ctx.location ? `📍 ${ctx.location}` : null,
    '',
    hashtags(product, ctx.shopName),
  ];
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Threads allows 500 characters a post; a margin is left because emoji and links are counted generously. */
export const THREADS_LIMIT = 480;
const length = (text: string) => Array.from(text).length;

/**
 * The same post for Threads: shorter and plainer, always within its 500 characters. Name, price, the link and WhatsApp come first;
 * when the text is too long the location goes, then the options, then the name is cut, so the link and the price are never lost.
 */
export function buildThreadsCaption(product: PostableProduct, ctx: PostContext, day: string): string {
  const opener = OPENERS[hash(`${product.id}:${day}:threads`) % OPENERS.length];
  const options = optionLines(product.options);
  const link = `🛒 ${postLink(ctx.origin, product.slug, 'threads')}`;
  const compose = (name: string, opts: { options: boolean; location: boolean; whatsapp: boolean }) =>
    [opener, '', name, priceLine(product), ...(opts.options ? options : []), '', link, opts.whatsapp && ctx.whatsapp ? `💬 ${ctx.whatsapp}` : null, opts.location && ctx.location ? `📍 ${ctx.location}` : null]
      .filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  for (const opts of [
    { options: true, location: true, whatsapp: true },
    { options: true, location: false, whatsapp: true },
    { options: false, location: false, whatsapp: true },
    { options: false, location: false, whatsapp: false },
  ]) {
    const text = compose(product.name, opts);
    if (length(text) <= THREADS_LIMIT) return text;
  }
  const bare = { options: false, location: false, whatsapp: false };
  // Measured with a one-letter name: an empty one would collapse a blank line and read one character short.
  const maxName = THREADS_LIMIT - length(compose('x', bare)) + 1;
  return compose(`${Array.from(product.name).slice(0, Math.max(10, maxName - 1)).join('').trim()}…`, bare);
}

/** Whether a product is good enough to put on a shop's Page unattended. */
export function isPostable(p: (Omit<Partial<PostableProduct>, 'imageUrl'> & { imageUrl?: string | null }) | null | undefined): p is PostableProduct {
  if (!p) return false;
  if (!p.name || p.name.trim().length < 3 || p.name.length > 120) return false;
  if (!p.imageUrl || !/^https:\/\//i.test(p.imageUrl)) return false;
  if (!p.priceFrom || p.priceFrom <= 0) return false;
  if (!p.slug || !p.id) return false;
  return true;
}

// --- when ---------------------------------------------------------------------------------------------------------------

const NAIROBI_OFFSET_MS = 3 * 3_600_000;

/** "2026-11-08" and minutes since midnight, Nairobi time (no daylight saving there, always UTC+3). */
export function nairobiParts(now: Date): { day: string; minutes: number } {
  const local = new Date(now.getTime() + NAIROBI_OFFSET_MS);
  return { day: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

const parseTime = (t: string): number | null => {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(t.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Normalises "9:00" to "09:00", drops anything that is not a time, sorts, removes repeats, keeps six at most. */
export function cleanTimes(times: string[]): string[] {
  const minutes = [...new Set(times.map(parseTime).filter((m): m is number => m !== null))].sort((a, b) => a - b).slice(0, 6);
  return minutes.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
}

/** How long after its time a slot can still be posted. A deploy or an outage may delay a post, but a slot hours old is dropped. */
export const SLOT_GRACE_MINUTES = 90;

/** The slots that are due now: their time has passed, by no more than the grace. Each is "day@HH:MM". */
export function dueSlots(now: Date, times: string[]): Array<{ slotKey: string; scheduledFor: Date }> {
  const { day, minutes } = nairobiParts(now);
  const out: Array<{ slotKey: string; scheduledFor: Date }> = [];
  for (const time of cleanTimes(times)) {
    const at = parseTime(time)!;
    if (minutes >= at && minutes - at <= SLOT_GRACE_MINUTES) {
      out.push({ slotKey: `${day}@${time}`, scheduledFor: new Date(Date.parse(`${day}T${time}:00.000Z`) - NAIROBI_OFFSET_MS) });
    }
  }
  return out;
}

/** The next time a post is due after `now`, for the screen. */
export function nextSlot(now: Date, times: string[]): Date | null {
  const list = cleanTimes(times);
  if (!list.length) return null;
  const { day, minutes } = nairobiParts(now);
  for (const time of list) if (parseTime(time)! > minutes) return new Date(Date.parse(`${day}T${time}:00.000Z`) - NAIROBI_OFFSET_MS);
  const tomorrow = new Date(Date.parse(`${day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  return new Date(Date.parse(`${tomorrow}T${list[0]}:00.000Z`) - NAIROBI_OFFSET_MS);
}

// --- which ---------------------------------------------------------------------------------------------------------------

export type PickInput = {
  candidates: PostableProduct[];
  /** When each product was last posted to this channel. */
  lastPosted: Map<string, Date>;
  /** The brand of the most recent post, so two of the same brand do not run back to back when there is a choice. */
  lastBrand?: string | null;
  now: Date;
  cooldownDays: number;
};

/** How attractive a product is to post, from what the shelf can sell: choice of options, depth of stock, a sale, newness. */
export function score(p: PostableProduct, now: Date): number {
  const ageDays = (now.getTime() - p.createdAt.getTime()) / 86_400_000;
  const choices = p.options.reduce((n, g) => n + g.values.length, 0);
  return Math.min(choices, 6) * 2 + Math.min(p.stockUnits, 20) / 5 + (p.offer ? 3 : 0) + (ageDays < 14 ? 3 : 0);
}

/**
 * The next product to post. Never-posted products come first (best score first), then whichever was posted longest ago. A product
 * posted within the cooldown is passed over; if that leaves nothing (a small shop), the one posted longest ago goes again, as long
 * as it was at least a week ago. Two posts of the same brand in a row are avoided when there is another choice.
 */
export function pickProduct(input: PickInput): PostableProduct | null {
  const { candidates, lastPosted, now, cooldownDays } = input;
  const dayMs = 86_400_000;
  const since = (p: PostableProduct) => {
    const at = lastPosted.get(p.id);
    return at ? (now.getTime() - at.getTime()) / dayMs : Infinity;
  };
  const order = (a: PostableProduct, b: PostableProduct) => {
    const sa = since(a), sb = since(b);
    if (sa !== sb) return sb - sa; // longest ago (or never) first
    return score(b, now) - score(a, now) || a.id.localeCompare(b.id);
  };
  let pool = candidates.filter((p) => since(p) >= cooldownDays).sort(order);
  if (!pool.length) pool = candidates.filter((p) => since(p) >= 7).sort(order);
  if (!pool.length) return null;
  const brand = (input.lastBrand ?? '').toLowerCase();
  return (brand ? pool.find((p) => (p.brand ?? '').toLowerCase() !== brand) : null) ?? pool[0];
}
