/**
 * The colours of a shop's Status picture, taken from its theme. The picture is always dark (it reads well full-screen on a phone), tinted with
 * the shop's primary colour, and the highlight (the price) is its accent colour, lightened when needed until it can be read on that background.
 * Whatever colours a shop picks, the text keeps a contrast of at least 4.5 : 1 (WCAG AA).
 */
export type StatusPalette = { bg: string; ink: string; muted: string; accent: string; rule: string };

type Rgb = [number, number, number];

export function parseHex(hex: string | null | undefined): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim()) ?? /^#?([0-9a-f]{3})$/i.exec((hex ?? '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];
const INK: Rgb = [245, 242, 234];
const DEFAULT_PRIMARY: Rgb = [36, 56, 168];
const DEFAULT_ACCENT: Rgb = [217, 178, 106];

/** Moves `from` toward `toward` in small steps until it reads on `bg` at the wanted contrast. */
function readable(from: Rgb, toward: Rgb, bg: Rgb, wanted: number): Rgb {
  let c = from;
  for (let i = 0; i < 20 && contrast(c, bg) < wanted; i += 1) c = mix(c, toward, 0.1 * (i + 1));
  return contrast(c, bg) >= wanted ? c : toward;
}

export function statusPalette(primaryHex?: string | null, accentHex?: string | null): StatusPalette {
  const primary = parseHex(primaryHex) ?? DEFAULT_PRIMARY;
  const accent = parseHex(accentHex) ?? DEFAULT_ACCENT;
  // Mostly black, so that a pale or saturated primary colour cannot hurt legibility; just enough of it to feel like the shop's own.
  const bg = mix(primary, BLACK, 0.82);
  return {
    bg: toHex(bg),
    ink: toHex(readable(INK, WHITE, bg, 7)),
    muted: toHex(readable(mix(INK, bg, 0.35), WHITE, bg, 4.5)),
    accent: toHex(readable(accent, WHITE, bg, 4.5)),
    rule: toHex(mix(bg, WHITE, 0.14)),
  };
}
