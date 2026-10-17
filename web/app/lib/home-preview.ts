import { getProducts, ShopTheme } from '@/app/lib/api';

/**
 * The image a shop's landing page shows in link previews: its hero photo, else its
 * logo, else the first photo of its first product -- so a shop that hasn't set up
 * either yet still gets a picture in a WhatsApp/Facebook/X preview instead of none.
 * Used by both the page's meta tags and the /og/home image route, so the two can
 * never disagree about whether an image exists.
 */
export async function homePreviewImageUrl(theme: Pick<ShopTheme, 'heroImageUrl' | 'logoUrl'>): Promise<string | null> {
  if (theme.heroImageUrl) return theme.heroImageUrl;
  if (theme.logoUrl) return theme.logoUrl;
  try {
    const products = await getProducts();
    return products.find((p) => p.imageUrls?.[0])?.imageUrls[0] ?? null;
  } catch {
    return null;
  }
}
