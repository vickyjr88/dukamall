/**
 * Curated font pairings a shop owner picks from -- design doc S:1.4, Tier 1
 * theming. Deliberately a short, fixed list rather than open typography: a
 * shop picks a pairing, not individual fonts, so every combination is
 * guaranteed to look considered. Chosen for an editorial-minimal storefront
 * (Dawn/Sense-tier): a distinctive serif or characterful sans for display,
 * a clean, highly-legible workhorse for body copy.
 */
export const FONT_PAIRINGS: Record<string, { display: string; body: string; googleFontsHref: string }> = {
  'fraunces-manrope': {
    display: "'Fraunces', Georgia, serif",
    body: "'Manrope', -apple-system, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap',
  },
  'playfair-inter': {
    display: "'Playfair Display', Georgia, serif",
    body: "'Inter', -apple-system, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap',
  },
  'poppins-only': {
    display: "'Poppins', -apple-system, sans-serif",
    body: "'Poppins', -apple-system, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap',
  },
  'dm-serif-work': {
    display: "'DM Serif Display', Georgia, serif",
    body: "'Work Sans', -apple-system, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Work+Sans:wght@400;500;600;700&display=swap',
  },
  'unbounded-sans': {
    display: "'Unbounded', -apple-system, sans-serif",
    body: "'Sora', -apple-system, sans-serif",
    googleFontsHref: 'https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=Sora:wght@400;500;600;700&display=swap',
  },
};

export const DEFAULT_FONT_PAIRING = 'fraunces-manrope';
