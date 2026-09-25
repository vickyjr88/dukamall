/**
 * Curated font pairings a shop owner picks from -- design doc S:1.4, Tier 1
 * theming. Deliberately a short, fixed list rather than open typography: a
 * shop picks a pairing, not individual fonts, so every combination is
 * guaranteed to look considered.
 */
export const FONT_PAIRINGS: Record<string, { display: string; body: string; googleFontsHref: string }> = {
  'fraunces-manrope': {
    display: "'Fraunces', Georgia, serif",
    body: "'Manrope', -apple-system, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Manrope:wght@400;500;700;800&display=swap',
  },
  'playfair-inter': {
    display: "'Playfair Display', Georgia, serif",
    body: "'Inter', -apple-system, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&display=swap',
  },
  'poppins-only': {
    display: "'Poppins', -apple-system, sans-serif",
    body: "'Poppins', -apple-system, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  },
};

export const DEFAULT_FONT_PAIRING = 'fraunces-manrope';
