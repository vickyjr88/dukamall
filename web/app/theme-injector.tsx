import { ShopTheme } from './lib/api';
import { FONT_PAIRINGS, DEFAULT_FONT_PAIRING } from './lib/font-pairings';

// Sanitized server-side too (mirrors the backend's own hex validation in
// ShopService.updateTheme) -- this value is about to be embedded in a raw
// <style> tag, and a shop's saved theme could in principle be stale or
// corrupted data rather than a fresh, already-validated write.
function safeHex(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function ThemeInjector({ theme }: { theme: ShopTheme }) {
  const pairing = FONT_PAIRINGS[theme.fontPairing] ?? FONT_PAIRINGS[DEFAULT_FONT_PAIRING];
  const primary = safeHex(theme.primaryColor, '#2438a8');
  const accent = safeHex(theme.accentColor, '#0f7a40');

  return (
    <>
      <link rel="stylesheet" href={pairing.googleFontsHref} />
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              --shop-primary: ${primary};
              --shop-accent: ${accent};
              --shop-font-display: ${pairing.display};
              --shop-font-body: ${pairing.body};
            }
          `,
        }}
      />
    </>
  );
}
