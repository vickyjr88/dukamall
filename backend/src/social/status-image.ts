import * as opentype from 'opentype.js';
import sharp from 'sharp';
import { BRAND_FONT_BASE64 } from './brand-font';
import { PostableProduct, statusDetails } from './social-post';
import { StatusPalette } from './status-palette';

/** WhatsApp Status is a full-screen 9:16 picture. */
export const STATUS_WIDTH = 1080;
export const STATUS_HEIGHT = 1920;

/** The photo starts under the shop's name; text flows below it; the call to action is fixed at the foot. */
const PHOTO_TOP = 170;
const PHOTO_MAX = 1080;
/** The photo may shrink this far to make room for the text of a long name, an offer and two lines of options. */
const PHOTO_MIN = 760;
const TEXT_LIMIT = 1700;
const FOOT_RULE = 1738;

let cachedFont: opentype.Font | null = null;
function font(): opentype.Font {
  if (!cachedFont) {
    const buf = Buffer.from(BRAND_FONT_BASE64, 'base64');
    cachedFont = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return cachedFont;
}

/**
 * What can be drawn: the font has no emoji and only some symbols, and a missing letter would come out as an empty box. Anything the font lacks is left out
 * (a shop that names a product "Nike 🔥 Air" gets "Nike Air"), whitespace is tidied.
 */
export function drawable(text: string): string {
  return Array.from(text ?? '').filter((ch) => /\s/.test(ch) || font().charToGlyphIndex(ch) > 0).join('').replace(/\s+/g, ' ').trim();
}

const widthOf = (text: string, size: number, spacing = 0) => font().getAdvanceWidth(text, size) + spacing * Math.max(0, Array.from(text).length - 1);

/** Text as an SVG path, centred on the picture. Drawn from the font's outlines, so it looks the same on any machine. */
function line(text: string, size: number, baseline: number, fill: string, opts: { spacing?: number; strike?: boolean } = {}): string {
  const spacing = opts.spacing ?? 0;
  const total = widthOf(text, size, spacing);
  let x = (STATUS_WIDTH - total) / 2;
  const parts: string[] = [];
  if (spacing) {
    for (const ch of Array.from(text)) {
      parts.push(font().getPath(ch, x, baseline, size).toPathData(2));
      x += font().getAdvanceWidth(ch, size) + spacing;
    }
  } else {
    parts.push(font().getPath(text, x, baseline, size).toPathData(2));
  }
  const strike = opts.strike ? `<rect x="${(STATUS_WIDTH - total) / 2}" y="${baseline - size * 0.3}" width="${total}" height="${Math.max(3, size / 16)}" fill="${fill}"/>` : '';
  return `<path d="${parts.join(' ')}" fill="${fill}"/>${strike}`;
}

/** Words onto lines no wider than `max`, the text shrinking from `size` (to `min`) until it fits in `maxLines`. Returns the lines and the size used. */
export function fit(text: string, size: number, min: number, max: number, maxLines: number): { lines: string[]; size: number } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  for (let s = size; s >= min; s -= 2) {
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const trial = current ? `${current} ${w}` : w;
      if (widthOf(trial, s) <= max || !current) current = trial; else { lines.push(current); current = w; }
    }
    if (current) lines.push(current);
    if (lines.length <= maxLines && lines.every((l) => widthOf(l, s) <= max)) return { lines, size: s };
  }
  // Still too long at the smallest size: keep what fits on the allowed lines and end with an ellipsis.
  const s = min;
  const out: string[] = [];
  let current = '';
  for (const w of words) {
    const trial = current ? `${current} ${w}` : w;
    if (widthOf(trial, s) <= max) current = trial; else { if (current) out.push(current); current = widthOf(w, s) <= max ? w : ''; }
    if (out.length === maxLines) break;
  }
  if (out.length < maxLines && current) out.push(current);
  const last = out.slice(0, maxLines);
  while (last.length && last[last.length - 1] && widthOf(`${last[last.length - 1]}…`, s) > max) last[last.length - 1] = last[last.length - 1].slice(0, -1);
  if (last.length) last[last.length - 1] += '…';
  return { lines: last.length ? last : ['…'], size: s };
}

/** The shop's name as a spaced wordmark on one line: wide spacing and 44 px if it fits, tighter and smaller for a long name, never wider than the picture. */
export function wordmark(name: string, max: number): { text: string; size: number; spacing: number; width: number } {
  const text = drawable(name).toUpperCase() || 'SHOP';
  for (let size = 44; size >= 26; size -= 2) {
    for (const spacing of [12, 8, 4, 2]) if (widthOf(text, size, spacing) <= max) return { text, size, spacing, width: widthOf(text, size, spacing) };
  }
  const trimmed = fit(text, 26, 26, max, 1).lines[0];
  return { text: trimmed, size: 26, spacing: 0, width: widthOf(trimmed, 26) };
}

export type StatusFacts = { shopName: string; whatsapp: string; site: string; palette: StatusPalette };

/** "https://wa.me/254712345678" or "0712345678" as the number people know: "0712 345 678". Anything else is shown as given. */
export function readablePhone(raw: string): string {
  const digits = raw.replace(/^https?:\/\/wa\.me\//i, '').replace(/\D/g, '');
  if (/^254[17]\d{8}$/.test(digits)) return `0${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  if (/^0[17]\d{8}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return digits ? `+${digits}` : '';
}

/**
 * The picture as drawing instructions (everything except the product photo), and how tall the photo may be. The text block is laid out first and the
 * photo takes what is left, so a long name with an offer and two lines of options can never run into the call to action at the foot.
 * Kept separate from the rendering so it can be tested without a photo.
 */
export function statusOverlay(product: PostableProduct, facts: StatusFacts): { svg: string; photoHeight: number; textBottom: number } {
  const { palette: c } = facts;
  const max = STATUS_WIDTH - 120;

  const text = (top: number): { parts: string[]; bottom: number } => {
    const parts: string[] = [];
    let y = top;
    const name = fit(drawable(product.name) || 'Product', 66, 44, max, 2);
    y += 36 + name.size;
    for (const l of name.lines) { parts.push(line(l, name.size, y, c.ink)); y += name.size * 1.12; }

    y += 16;
    const prefix = !product.offer && product.priceTo && product.priceTo !== product.priceFrom ? 'From ' : '';
    if (product.offer) {
      parts.push(line(`was KES ${Math.round(product.offer.was).toLocaleString('en-KE')}`, 40, y + 30, c.muted, { strike: true }));
      y += 52;
    }
    const priceText = `KES ${Math.round(product.offer ? product.offer.price : product.priceFrom).toLocaleString('en-KE')}`;
    parts.push(line(`${prefix}${priceText}`, 104, y + 84, product.offer ? c.accent : c.ink));
    y += 84 + 30;

    // What it comes in, by what kind of product it is: sizes for shoes and clothes, storage and colour for a phone, nothing for a watch.
    for (const detail of statusDetails(product.options)) {
      const s = fit(drawable(`${detail.label}  ${detail.value}`), 40, 26, max, 1);
      y += 14 + s.size;
      parts.push(line(s.lines[0], s.size, y, c.muted));
    }
    return { parts, bottom: y };
  };

  // Measure the block, then place it under a photo that is as tall as the room allows.
  const measured = text(0).bottom + 8;
  const photoHeight = Math.floor(Math.max(PHOTO_MIN, Math.min(PHOTO_MAX, TEXT_LIMIT - PHOTO_TOP - measured)));
  const placed = text(PHOTO_TOP + photoHeight);

  const parts: string[] = [`<rect width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" fill="${c.bg}"/>`];
  const mark = wordmark(facts.shopName, max);
  parts.push(line(mark.text, mark.size, 100, c.ink, { spacing: mark.spacing }));
  parts.push(`<rect x="${STATUS_WIDTH / 2 - 40}" y="128" width="80" height="4" fill="${c.accent}"/>`);
  parts.push(...placed.parts);

  // Fixed foot of the picture, so the call to action is always in the same place.
  parts.push(`<rect x="60" y="${FOOT_RULE}" width="${STATUS_WIDTH - 120}" height="2" fill="${c.rule}"/>`);
  parts.push(line('Reply to this status to order', 46, 1806, c.accent));
  const phone = facts.whatsapp ? readablePhone(facts.whatsapp) : '';
  const host = facts.site.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const foot = fit(drawable([host, phone ? `WhatsApp ${phone}` : ''].filter(Boolean).join('   ·   ')), 34, 22, max, 1).lines[0];
  parts.push(line(foot, 34, 1868, c.muted));
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${STATUS_WIDTH}" height="${STATUS_HEIGHT}" viewBox="0 0 ${STATUS_WIDTH} ${STATUS_HEIGHT}">${parts.join('')}</svg>`, photoHeight, textBottom: placed.bottom };
}

/** The finished 1080x1920 picture for a product: its photo, the name, the price, what is in stock and how to order, in the shop's own colours. */
export async function renderStatusImage(product: PostableProduct, photo: Buffer, facts: StatusFacts): Promise<Buffer> {
  const { svg, photoHeight } = statusOverlay(product, facts);
  const picture = await sharp(photo, { failOn: 'none' }).rotate().resize(STATUS_WIDTH, photoHeight, { fit: 'cover', position: 'attention' }).toBuffer();
  return sharp(Buffer.from(svg))
    .composite([{ input: picture, left: 0, top: PHOTO_TOP }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
