import { getTheme } from '@/app/lib/api';
import { ogImageResponse } from '@/app/lib/og-image';

export const dynamic = 'force-dynamic';

// The landing page's link-preview image: the shop's hero photo, or its logo
// when it has none (the same fallback generateMetadata in
// app/(storefront)/page.tsx uses to decide whether to offer an image at all).
export async function GET() {
  const theme = await getTheme();
  return ogImageResponse(theme.heroImageUrl || theme.logoUrl);
}
