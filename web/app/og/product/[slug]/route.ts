import { getProduct } from '@/app/lib/api';
import { ogImageResponse } from '@/app/lib/og-image';

export const dynamic = 'force-dynamic';

// A product page's link-preview image: its first photo.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const product = await getProduct(params.slug);
  const image = Array.isArray(product?.imageUrls) ? product.imageUrls[0] : null;
  return ogImageResponse(image);
}
