import * as opentype from 'opentype.js';
import sharp from 'sharp';
import { DISPLAY_FONT_BASE64, LABEL_FONT_BASE64 } from './status-fonts';
import { PostableProduct, statusDetails } from './social-post';
import { StatusPalette } from './status-palette';

/** WhatsApp Status is a full-screen 9:16 picture. */
export const STATUS_WIDTH = 1080;
export const STATUS_HEIGHT = 1920;

/**
 * The picture is a small gallery wall: the product hangs on a framed plate over a dark backdrop made from its own colours, with the shop's name above,
 * what it costs and what it comes in below, one button, and the shop's contact and promises at the foot.
 *
 * The plate takes whatever height the text leaves it (never under PLATE_MIN, never over PLATE_MAX), so a long name with an offer and two lines of options
 * cannot run into the button, and a plain product gets a taller, calmer picture.
 */
const FRAME = 28;
const PLATE_X = 100;
const PLATE_W = STATUS_WIDTH - 2 * PLATE_X;
const PLATE_TOP = 214;
const PLATE_MIN = 640;
const PLATE_MAX = 940;
const PLATE_RADIUS = 28;
const CTA_TOP = 1640;
const CTA_H = 80;
const TEXT_LIMIT = CTA_TOP - 40;
/** Where the button starts: nothing above it may reach below this. */
export const FOOT_TOP = CTA_TOP;

type Face = 'display' | 'label';
const cache: Partial<Record<Face, opentype.Font>> = {};
function font(face: Face): opentype.Font {
  if (!cache[face]) {
    const buf = Buffer.from(face === 'display' ? DISPLAY_FONT_BASE64 : LABEL_FONT_BASE64, 'base64');
    cache[face] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return cache[face]!;
}

/**
 * What can be drawn: the fonts have no emoji and only some symbols, and a missing letter would come out as an empty box. Anything a font lacks is left out
 * (a shop that names a product "Nike 🔥 Air" gets "Nike Air"), whitespace is tidied.
 */
export function drawable(text: string, face: Face = 'display'): string {
  return Array.from(text ?? '').filter((ch) => /\s/.test(ch) || font(face).charToGlyphIndex(ch) > 0).join('').replace(/\s+/g, ' ').trim();
}

const widthOf = (text: string, size: number, spacing = 0, face: Face = 'display') =>
  font(face).getAdvanceWidth(text, size) + spacing * Math.max(0, Array.from(text).length - 1);

/** One piece of text that can be placed anywhere: its width is known first, so several can share a baseline and be centred as a group. */
type Run = { width: number; draw: (x: number, baseline: number) => string };
function run(text: string, size: number, fill: string, opts: { face?: Face; spacing?: number; strike?: boolean } = {}): Run {
  const face = opts.face ?? 'display';
  const spacing = opts.spacing ?? 0;
  const width = widthOf(text, size, spacing, face);
  return {
    width,
    draw: (x, baseline) => {
      let d: string;
      if (spacing) {
        const parts: string[] = [];
        let cx = x;
        for (const ch of Array.from(text)) { parts.push(font(face).getPath(ch, cx, baseline, size).toPathData(2)); cx += font(face).getAdvanceWidth(ch, size) + spacing; }
        d = parts.join(' ');
      } else d = font(face).getPath(text, x, baseline, size).toPathData(2);
      const strike = opts.strike ? `<rect x="${x}" y="${baseline - size * 0.36}" width="${width}" height="2" fill="${fill}"/>` : '';
      return `<path d="${d}" fill="${fill}"/>${strike}`;
    },
  };
}
/** Runs side by side with `gap` between, the group centred on the picture. */
function group(runs: Run[], gap: number, baseline: number): string {
  const total = runs.reduce((n, r) => n + r.width, 0) + gap * Math.max(0, runs.length - 1);
  let x = (STATUS_WIDTH - total) / 2;
  return runs.map((r) => { const out = r.draw(x, baseline); x += r.width + gap; return out; }).join('');
}
const centred = (r: Run, baseline: number) => group([r], 0, baseline);

/** Words onto lines no wider than `max`, the text shrinking from `size` (to `min`) until it fits in `maxLines`. Returns the lines and the size used. */
export function fit(text: string, size: number, min: number, max: number, maxLines: number, face: Face = 'display'): { lines: string[]; size: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const w = (t: string, s: number) => widthOf(t, s, 0, face);
  for (let s = size; s >= min; s -= 2) {
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (w(trial, s) <= max || !current) current = trial; else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((l) => w(l, s) <= max)) return { lines, size: s };
  }
  // Still too long at the smallest size: keep what fits on the allowed lines and end with an ellipsis.
  const s = min;
  const out: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (w(trial, s) <= max) current = trial; else { if (current) out.push(current); current = w(word, s) <= max ? word : ''; }
    if (out.length === maxLines) break;
  }
  if (out.length < maxLines && current) out.push(current);
  const last = out.slice(0, maxLines);
  while (last.length && last[last.length - 1] && w(`${last[last.length - 1]}…`, s) > max) last[last.length - 1] = last[last.length - 1].slice(0, -1);
  if (last.length) last[last.length - 1] += '…';
  return { lines: last.length ? last : ['…'], size: s };
}

/** The shop's name as a spaced wordmark on one line: wide spacing and 46 px if it fits, tighter and smaller for a long name, never wider than `max`. */
export function wordmark(name: string, max: number): { text: string; size: number; spacing: number; width: number } {
  const text = drawable(name).toUpperCase() || 'SHOP';
  for (let size = 46; size >= 26; size -= 2) {
    for (const spacing of [14, 9, 5, 2]) if (widthOf(text, size, spacing) <= max) return { text, size, spacing, width: widthOf(text, size, spacing) };
  }
  const trimmed = fit(text, 26, 26, max, 1).lines[0];
  return { text: trimmed, size: 26, spacing: 0, width: widthOf(trimmed, 26) };
}

export type StatusFacts = {
  shopName: string; whatsapp: string; site: string; palette: StatusPalette;
  /** Where the shop is ("Dubai Merchants Mall, Nairobi"), under its name. Left out when the shop has not said. */
  location?: string;
  /** Short promises that are true of this shop (see statusTrust), at the foot. At most three are drawn. */
  trust?: string[];
};

/** "https://wa.me/254712345678" or "0712345678" as the number people know: "0712 345 678". Anything else is shown as given. */
export function readablePhone(raw: string): string {
  const digits = raw.replace(/^https?:\/\/wa\.me\//i, '').replace(/\D/g, '');
  if (/^254[17]\d{8}$/.test(digits)) return `0${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  if (/^0[17]\d{8}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return digits ? `+${digits}` : '';
}

/**
 * The promises a Status may make for a shop: only what its own settings back, the same rule the storefront follows (web/app/lib/trust.ts).
 * A promise that is not kept costs more trust than the picture gains, so nothing is claimed for a shop that has not set it up.
 */
export function statusTrust(shop: { freeDeliveryOverKes?: unknown; paystackSecretKey?: string | null; paystackPublicKey?: string | null; whatsappNumber?: string | null; address?: string | null }): string[] {
  const freeOver = Number(shop.freeDeliveryOverKes ?? 0);
  const out = [
    freeOver > 0 ? `Free delivery over KES ${Math.round(freeOver).toLocaleString('en-KE')}` : 'We deliver',
    shop.paystackSecretKey && shop.paystackPublicKey ? 'Secure online payment' : 'Every order confirmed with you',
  ];
  if (shop.whatsappNumber) out.push('Order on WhatsApp');
  else if (shop.address) out.push('Visit us in store');
  return out.slice(0, 3);
}

/** The sizes as chips: "EUR 40, EUR 41" becomes the unit "EUR" and the values "40", "41". Null when there are none, or too many to read as chips. */
export function sizeChips(product: Pick<PostableProduct, 'options'>): { unit: string; values: string[] } | null {
  const sizes = product.options.find((g) => g.key === 'size');
  const raw = (sizes?.values ?? []).map((v) => String(v).trim()).filter(Boolean);
  if (!raw.length || raw.length > 14) return null;
  const unit = /^([A-Za-z]{2,4})\s+\d/.exec(raw[0])?.[1] ?? '';
  const values = unit && raw.every((v) => v.startsWith(`${unit} `)) ? raw.map((v) => v.slice(unit.length + 1)) : raw;
  return { unit: unit ? unit.toUpperCase() : '', values };
}

/** What the badge on the plate says, and only when it is true: the saving on an offer, else "New in" for a product added in the last 14 days. */
export function badgeFor(product: Pick<PostableProduct, 'offer' | 'createdAt'>, now = new Date()): string | null {
  if (product.offer && product.offer.was > product.offer.price) {
    const pct = Math.round(((product.offer.was - product.offer.price) / product.offer.was) * 100);
    return pct >= 5 ? `SAVE ${pct}%` : 'ON OFFER';
  }
  const added = product.createdAt instanceof Date ? product.createdAt.getTime() : NaN;
  return Number.isFinite(added) && now.getTime() >= added && now.getTime() - added <= 14 * 86_400_000 ? 'NEW IN' : null;
}

/** A vertical foil gradient (see `over`'s defs): the price, the button and the badge are filled with it. */
const GOLD = 'url(#gold)';
const kes = (n: number) => Math.round(n).toLocaleString('en-KE');
const roundedRect = (x: number, y: number, w: number, h: number, r: number) => `x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}"`;
const diamond = (cx: number, cy: number, r: number, fill: string) => `<path d="M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z" fill="${fill}"/>`;

export type StatusOverlay = {
  /** Drawn over the backdrop photo and under the plate: tint, glow, vignette, the plate's shadow. */
  under: string;
  /** Drawn over the plate: frame, badge, all the text. */
  over: string;
  plate: { x: number; y: number; w: number; h: number; radius: number };
  /** Where the text above the button ends. */
  textBottom: number;
  /** under and over together, for a quick look and for tests. */
  svg: string;
  /** The plate's height (what the photo's height was in the first layout). */
  photoHeight: number;
};

/**
 * The picture as drawing instructions (everything except the photo), and where the plate goes. The text below the plate is laid out first and the plate
 * takes what is left. Kept separate from the rendering so it can be tested without a photo.
 */
export function statusOverlay(product: PostableProduct, facts: StatusFacts, now = new Date()): StatusOverlay {
  const { palette: c } = facts;
  const maxText = STATUS_WIDTH - 2 * 96;

  /** The block under the plate, from `top` down; also how tall it is (call with 0 to measure). */
  const below = (top: number): { parts: string[]; bottom: number } => {
    const parts: string[] = [];
    let y = top;

    const brand = drawable(product.brand ?? '', 'label').toUpperCase();
    if (brand) {
      const b = fit(brand, 28, 22, maxText, 1, 'label');
      y += 34;
      parts.push(centred(run(b.lines[0], b.size, c.accent, { face: 'label', spacing: 9 }), y));
      y += 20;
    }

    const name = fit(drawable(product.name) || 'Product', 80, 50, maxText, 2);
    y += name.size * 0.86;
    name.lines.forEach((l, i) => { if (i) y += name.size * 1.02; parts.push(centred(run(l, name.size, c.ink), y)); });
    y += name.size * 0.22;

    // A hairline with a diamond in it: the quiet separator of a printed card.
    y += 30;
    parts.push(`<rect x="${STATUS_WIDTH / 2 - 150}" y="${y}" width="120" height="1.5" fill="${c.accentSoft}"/><rect x="${STATUS_WIDTH / 2 + 30}" y="${y}" width="120" height="1.5" fill="${c.accentSoft}"/>${diamond(STATUS_WIDTH / 2, y + 0.75, 7, c.accent)}`);
    y += 34;

    // Price. An offer shows what it was, struck through, above the price now.
    const price = product.offer ? product.offer.price : product.priceFrom;
    const ranged = !product.offer && product.priceTo && product.priceTo !== product.priceFrom;
    if (product.offer) {
      y += 30;
      parts.push(group([run('WAS', 28, c.muted, { face: 'label', spacing: 4 }), run(`KES ${kes(product.offer.was)}`, 32, c.muted, { face: 'label', spacing: 3, strike: true })], 16, y));
      y += 22;
    }
    const lead: Run[] = [];
    if (ranged) lead.push(run('FROM', 28, c.muted, { face: 'label', spacing: 5 }));
    lead.push(run('KES', 38, GOLD, { face: 'label', spacing: 5 }));
    const number = run(kes(price), 138, GOLD);
    y += 112;
    parts.push(group([...lead, number], 18, y));
    y += 34;

    // What it comes in. Sizes read best as chips; anything else (storage, colour) as a labelled line.
    const chips = sizeChips(product);
    if (chips) {
      y += 24;
      parts.push(centred(run(chips.unit ? `SIZES  ·  ${chips.unit}` : 'SIZES', 26, c.muted, { face: 'label', spacing: 6 }), y));
      y += 22;
      const h = 68;
      const gap = 12;
      let size = 32; let pad = 24; let items = chips.values;
      const widthFor = (list: string[], s: number, p: number) => list.reduce((n, v) => n + Math.max(h, widthOf(v, s, 0, 'label') + 2 * p), 0) + gap * Math.max(0, list.length - 1);
      while (widthFor(items, size, pad) > maxText && (size > 24 || pad > 14)) { size = Math.max(24, size - 2); pad = Math.max(14, pad - 2); }
      // Still wider than the picture: show as many as fit and say how many more there are.
      let more = 0;
      while (items.length > 1 && widthFor(more ? [...items, `+${more}`] : items, size, pad) > maxText) { items = items.slice(0, -1); more = chips.values.length - items.length; }
      const shown = more ? [...items, `+${more}`] : items;
      let x = (STATUS_WIDTH - widthFor(shown, size, pad)) / 2;
      for (const v of shown) {
        const w = Math.max(h, widthOf(v, size, 0, 'label') + 2 * pad);
        parts.push(`<rect ${roundedRect(x + 1, y + 1, w - 2, h - 2, (h - 2) / 2)} fill="none" stroke="${c.accentSoft}" stroke-width="2"/>`);
        parts.push(run(v, size, c.ink, { face: 'label' }).draw(x + (w - widthOf(v, size, 0, 'label')) / 2, y + h / 2 + size * 0.36));
        x += w + gap;
      }
      y += h;
    } else {
      for (const detail of statusDetails(product.options)) {
        const label = drawable(detail.label, 'label').toUpperCase();
        const value = fit(drawable(detail.value, 'label'), 34, 24, maxText, 1, 'label');
        y += 28;
        parts.push(centred(run(label, 22, c.muted, { face: 'label', spacing: 6 }), y));
        y += 8 + value.size;
        parts.push(centred(run(value.lines[0], value.size, c.ink, { face: 'label' }), y));
        y += 8;
      }
    }
    return { parts, bottom: y };
  };

  // Measure the block, then place it under a plate as tall as the room allows.
  const measured = below(0).bottom;
  const plateH = Math.floor(Math.max(PLATE_MIN, Math.min(PLATE_MAX, TEXT_LIMIT - PLATE_TOP - 44 - measured)));
  const plate = { x: PLATE_X, y: PLATE_TOP, w: PLATE_W, h: plateH, radius: PLATE_RADIUS };
  const placed = below(PLATE_TOP + plateH + 44);

  // --- under the plate -------------------------------------------------------------------------------------------------
  const under = [
    `<defs>`,
    `<radialGradient id="glow" cx="50%" cy="34%" r="62%"><stop offset="0" stop-color="${c.glow}" stop-opacity="0.7"/><stop offset="1" stop-color="${c.glow}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="vig" cx="50%" cy="42%" r="78%"><stop offset="0.45" stop-color="${c.bg}" stop-opacity="0"/><stop offset="1" stop-color="${c.bg}" stop-opacity="0.78"/></radialGradient>`,
    `<linearGradient id="calm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.bg}" stop-opacity="0"/><stop offset="1" stop-color="${c.bg}" stop-opacity="0.96"/></linearGradient>`,
    `<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="30"/></filter>`,
    `<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`,
    `</defs>`,
    `<rect width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" fill="${c.bg}" opacity="0.56"/>`,
    `<rect width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" fill="url(#glow)"/>`,
    `<rect width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" fill="url(#vig)"/>`,
    `<rect y="1040" width="${STATUS_WIDTH}" height="${STATUS_HEIGHT - 1040}" fill="url(#calm)"/>`,
    // A little grain keeps the dark gradients from banding in a JPEG and gives the surface some texture.
    `<rect width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" fill="#ffffff" opacity="0.045" filter="url(#grain)"/>`,
    `<rect ${roundedRect(plate.x + 6, plate.y + 30, plate.w - 12, plate.h, plate.radius)} fill="#000000" opacity="0.6" filter="url(#shadow)"/>`,
  ];

  // --- over the plate --------------------------------------------------------------------------------------------------
  const over: string[] = [];
  // Frame: a fine double line round the whole picture.
  over.push(`<rect x="${FRAME}" y="${FRAME}" width="${STATUS_WIDTH - 2 * FRAME}" height="${STATUS_HEIGHT - 2 * FRAME}" fill="none" stroke="${c.accentSoft}" stroke-width="2"/>`);
  over.push(`<rect x="${FRAME + 12}" y="${FRAME + 12}" width="${STATUS_WIDTH - 2 * (FRAME + 12)}" height="${STATUS_HEIGHT - 2 * (FRAME + 12)}" fill="none" stroke="${c.accentSoft}" stroke-width="1" opacity="0.55"/>`);

  // Header: the wordmark between two hairlines, the place under it.
  const mark = wordmark(facts.shopName, STATUS_WIDTH - 2 * 150);
  const markRun = run(mark.text, mark.size, c.ink, { spacing: mark.spacing });
  over.push(centred(markRun, 112));
  const left = (STATUS_WIDTH - mark.width) / 2;
  const ruleLen = left - 40 - 96;
  if (ruleLen > 30) {
    over.push(`<rect x="96" y="${112 - mark.size * 0.3}" width="${ruleLen}" height="1.5" fill="${c.accentSoft}"/><rect x="${STATUS_WIDTH - 96 - ruleLen}" y="${112 - mark.size * 0.3}" width="${ruleLen}" height="1.5" fill="${c.accentSoft}"/>`);
  }
  const place = facts.location ? fit(drawable(facts.location, 'label').toUpperCase(), 24, 20, STATUS_WIDTH - 2 * 130, 1, 'label') : null;
  if (place && place.lines[0] && place.lines[0] !== '…') over.push(centred(run(place.lines[0], place.size, c.muted, { face: 'label', spacing: 5 }), 164));

  // The plate's own finish: a soft edge shading so a bright studio photo does not glare, a fine keyline, and a mat line just outside it.
  over.push(`<defs><linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.accentHi}"/><stop offset="0.5" stop-color="${c.accent}"/><stop offset="1" stop-color="${c.accentLo}"/></linearGradient><radialGradient id="edge" cx="50%" cy="50%" r="75%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.32"/></radialGradient></defs>`);
  over.push(`<rect ${roundedRect(plate.x, plate.y, plate.w, plate.h, plate.radius)} fill="url(#edge)"/>`);
  over.push(`<rect ${roundedRect(plate.x, plate.y, plate.w, plate.h, plate.radius)} fill="none" stroke="${c.accent}" stroke-opacity="0.7" stroke-width="2"/>`);
  over.push(`<rect ${roundedRect(plate.x - 14, plate.y - 14, plate.w + 28, plate.h + 28, plate.radius + 12)} fill="none" stroke="${c.accentSoft}" stroke-width="1.5"/>`);

  // A badge on the plate, only when it is true.
  const badge = badgeFor(product, now);
  if (badge) {
    const r = run(badge, 26, c.bg, { face: 'label', spacing: 5 });
    const w = r.width + 52;
    over.push(`<rect ${roundedRect(plate.x + 28, plate.y + 28, w, 54, 27)} fill="${GOLD}"/>`);
    over.push(r.draw(plate.x + 28 + 26, plate.y + 28 + 36));
  }

  over.push(...placed.parts);

  // The button: one thing to do.
  const cta = run('REPLY TO THIS STATUS TO ORDER', 30, c.bg, { face: 'label', spacing: 4 });
  const ctaW = Math.min(STATUS_WIDTH - 2 * 96, cta.width + 100);
  const ctaX = (STATUS_WIDTH - ctaW) / 2;
  over.push(`<rect ${roundedRect(ctaX - 9, CTA_TOP - 9, ctaW + 18, CTA_H + 18, (CTA_H + 18) / 2)} fill="none" stroke="${c.accentSoft}" stroke-width="1.5"/>`);
  over.push(`<rect ${roundedRect(ctaX, CTA_TOP, ctaW, CTA_H, CTA_H / 2)} fill="${GOLD}"/>`);
  over.push(cta.draw((STATUS_WIDTH - cta.width) / 2, CTA_TOP + CTA_H / 2 + 10));

  // Foot: how to reach the shop, the promises it can keep, and its address on the web.
  const phone = facts.whatsapp ? readablePhone(facts.whatsapp) : '';
  if (phone) over.push(group([run('WHATSAPP', 24, c.muted, { face: 'label', spacing: 6 }), run(phone, 40, c.ink, { face: 'label', spacing: 1 })], 22, 1776));
  // The button and the number already say "WhatsApp"; the picture keeps the promises that add something.
  const promises = (facts.trust ?? []).filter((t) => !/whatsapp/i.test(t)).map((t) => drawable(t, 'label').toUpperCase()).filter(Boolean).slice(0, 2);
  if (promises.length) {
    let size = 25;
    const gap = 40;
    const widthAt = (s: number) => promises.reduce((n, p) => n + widthOf(p, s, 3, 'label'), 0) + gap * (promises.length - 1);
    while (size > 19 && widthAt(size) > STATUS_WIDTH - 2 * 96) size -= 1;
    let x = (STATUS_WIDTH - widthAt(size)) / 2;
    promises.forEach((p, i) => {
      const r = run(p, size, c.muted, { face: 'label', spacing: 3 });
      over.push(r.draw(x, 1826));
      x += r.width;
      if (i < promises.length - 1) { over.push(diamond(x + gap / 2, 1826 - size * 0.34, 4, c.accent)); x += gap; }
    });
  }
  const host = drawable(facts.site.replace(/^https?:\/\//, '').replace(/\/+$/, ''), 'label');
  if (host) over.push(centred(run(host, 26, c.muted, { face: 'label', spacing: 2 }), 1868));

  const wrap = (parts: string[]) => `<svg xmlns="http://www.w3.org/2000/svg" width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" viewBox="0 0 ${STATUS_WIDTH} ${STATUS_HEIGHT}">${parts.join('')}</svg>`;
  return { under: wrap(under), over: wrap(over), plate, textBottom: placed.bottom, svg: wrap([...under, ...over]), photoHeight: plateH };
}

/** The finished 1080x1920 picture for a product: its photo framed on a backdrop made from its own colours, the name, the price, what it comes in and how to order. */
export async function renderStatusImage(product: PostableProduct, photo: Buffer, facts: StatusFacts, now = new Date()): Promise<Buffer> {
  const o = statusOverlay(product, facts, now);
  const source = () => sharp(photo, { failOn: 'none' }).rotate();
  // The backdrop is the same photo, shrunk and blurred into a wash of its own colours (shrinking first makes the blur cheap and smooth).
  const backdrop = await source().resize(216, 384, { fit: 'cover', position: 'attention' }).blur(16).resize(STATUS_WIDTH, STATUS_HEIGHT).modulate({ brightness: 0.62, saturation: 1.25 }).toBuffer();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${o.plate.w}" height="${o.plate.h}"><rect width="${o.plate.w}" height="${o.plate.h}" rx="${o.plate.radius}" ry="${o.plate.radius}" fill="#fff"/></svg>`);
  const plate = await source()
    .resize(o.plate.w, o.plate.h, { fit: 'cover', position: 'attention' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp(backdrop)
    .composite([
      { input: Buffer.from(o.under), left: 0, top: 0 },
      { input: plate, left: o.plate.x, top: o.plate.y },
      { input: Buffer.from(o.over), left: 0, top: 0 },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
