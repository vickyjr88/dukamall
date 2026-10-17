import { getTheme } from '@/app/lib/api';
import { homePreviewImageUrl } from '@/app/lib/home-preview';
import { ogImageResponse } from '@/app/lib/og-image';

export const dynamic = 'force-dynamic';

// The landing page's link-preview image: the shop's hero photo, else its logo, else
// its first product photo (see homePreviewImageUrl, shared with the page's meta tags).
export async function GET() {
  const theme = await getTheme();
  return ogImageResponse(await homePreviewImageUrl(theme));
}
