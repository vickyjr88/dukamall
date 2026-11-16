/**
 * The overall look of a storefront -- what the Theme page's "Style" picks. Colours were the one thing a shop could not change (the ink, paper and
 * line colours were fixed so a brand colour could never cost legibility); a style changes them as a *set*, curated and checked for contrast, so a
 * shop still cannot pick an unreadable combination but can pick a different world.
 *
 * - `classic` is the storefront as it always was. It sets no tokens at all, so the CSS defaults apply and nothing changes for any shop that has not
 *   chosen another style.
 * - `maison` and `noir` are the luxury styles. Besides the colours here, `[data-luxe]` in globals.css restyles the header, home page, product cards,
 *   product page, filters and footer.
 *
 * Tokens are injected as :root custom properties by ThemeInjector (so the page background and overscroll follow too, not just the wrapper div).
 * Keys are the ones the backend accepts (backend/src/shop/theme-options.ts); an unknown or missing key means classic.
 */
export type StylePreset = {
  key: string;
  luxe: boolean;
  /** The accent when the shop has not chosen a brand colour of its own. */
  gold: string;
  tokens: Record<string, string>;
};

/** The platform's default brand colour: a shop still on it has not picked one, so a luxury style uses its own accent instead of a stray blue. */
export const PLATFORM_DEFAULT_PRIMARY = '#2438a8';

export const STYLE_PRESETS: Record<string, StylePreset> = {
  classic: { key: 'classic', luxe: false, gold: '', tokens: {} },

  // Warm ivory paper, warm black ink. Muted text is #716859 on #f8f5ef (about 4.9:1), the lightest grey that still passes for small print.
  maison: {
    key: 'maison',
    luxe: true,
    gold: '#a1803f',
    tokens: {
      '--shop-paper': '#f8f5ef',
      '--shop-raised': '#fdfbf7',
      '--shop-surface': '#efe9df',
      '--shop-ink': '#17130e',
      '--shop-ink-soft': '#4d463c',
      '--shop-muted': '#716859',
      '--shop-line': '#e3dccf',
      '--shop-line-strong': '#cdc3b2',
      '--shop-on-ink': '#f8f5ef',
      '--shop-field': '#fdfbf7',
      '--shop-header-bg': 'rgba(248, 245, 239, 0.94)',
      '--shop-announce-bg': '#17130e',
      '--shop-announce-ink': '#efe9df',
      '--shop-footer-bg': '#17130e',
      '--shop-footer-ink': '#efe9df',
      '--shop-danger': '#9b2c22',
    },
  },

  // The same layout on black: ivory type, gold details. Muted #9b9384 on #0e0d0b is about 6.5:1.
  noir: {
    key: 'noir',
    luxe: true,
    gold: '#c9a96e',
    tokens: {
      '--shop-paper': '#0e0d0b',
      '--shop-raised': '#171511',
      '--shop-surface': '#1c1a16',
      '--shop-ink': '#f2ede4',
      '--shop-ink-soft': '#cfc7b8',
      '--shop-muted': '#9b9384',
      '--shop-line': '#2b2822',
      '--shop-line-strong': '#3d3931',
      '--shop-on-ink': '#0e0d0b',
      '--shop-field': '#171511',
      '--shop-header-bg': 'rgba(14, 13, 11, 0.92)',
      '--shop-announce-bg': '#1c1a16',
      '--shop-announce-ink': '#c9a96e',
      '--shop-footer-bg': '#080706',
      '--shop-footer-ink': '#d9d1c2',
      '--shop-danger': '#e26a5d',
    },
  },
};

export const DEFAULT_STYLE_PRESET = 'classic';

export function stylePresetFor(key: string | null | undefined): StylePreset {
  return STYLE_PRESETS[key ?? ''] ?? STYLE_PRESETS[DEFAULT_STYLE_PRESET];
}
