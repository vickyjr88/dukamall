/**
 * What a shop can choose under Theme, in one place: the validation (storefront-content.dto.ts), the portal's pickers
 * (ShopService.themeOptions) and the tests all read these, so a key can never be accepted but not offered, or offered but not accepted.
 * The web app keeps the matching look for each key in app/lib/style-presets.ts and app/lib/font-pairings.ts; a key it does not know falls back to
 * the default, so adding one here first is always safe.
 */
export const FONT_PAIRINGS = [
  { key: 'fraunces-manrope', label: 'Fraunces + Manrope (editorial serif)' },
  { key: 'playfair-inter', label: 'Playfair Display + Inter (classic elegant)' },
  { key: 'poppins-only', label: 'Poppins (modern, rounded)' },
  { key: 'dm-serif-work', label: 'DM Serif + Work Sans (warm editorial)' },
  { key: 'unbounded-sans', label: 'Unbounded + Sora (bold contemporary)' },
  { key: 'cormorant-jost', label: 'Cormorant Garamond + Jost (luxury, refined)' },
  { key: 'bodoni-hanken', label: 'Bodoni Moda + Hanken Grotesk (luxury, fashion editorial)' },
] as const;

export const LAYOUT_PRESETS = [
  { key: 'sharp', label: 'Sharp (square corners, no rounding)' },
  { key: 'soft', label: 'Soft (rounded corners)' },
] as const;

/**
 * The overall look. "classic" is the storefront as it was before styles existed, and the default, so no shop changes unless its owner picks another.
 * The luxury styles restyle the whole store: colours, typography, header, product cards, product page and footer.
 */
export const STYLE_PRESETS = [
  { key: 'classic', label: 'Classic (clean, editorial, white)', description: 'The original look: white pages, your brand colours on buttons, a search-and-filter bar on the home page.' },
  { key: 'maison', label: 'Maison (luxury, warm ivory)', description: 'Warm ivory pages, black type, hairline details and a gold accent. Quiet product cards, a navigation header and an editorial home page.' },
  { key: 'noir', label: 'Noir (luxury, black and gold)', description: 'The same luxury layout on black, with ivory type and gold details. Dramatic for dark or colourful products.' },
] as const;

export const FONT_PAIRING_KEYS: string[] = FONT_PAIRINGS.map((f) => f.key);
export const LAYOUT_PRESET_KEYS: string[] = LAYOUT_PRESETS.map((l) => l.key);
export const STYLE_PRESET_KEYS: string[] = STYLE_PRESETS.map((s) => s.key);
export const DEFAULT_STYLE_PRESET = 'classic';
