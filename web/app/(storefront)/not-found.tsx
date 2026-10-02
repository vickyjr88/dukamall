'use client';

import { useShopInfo } from '@/app/lib/shop-info-context';
import { NotFoundContent } from '@/app/not-found-content';

// Reached when a storefront page calls notFound() (an unknown product slug).
// Renders inside StorefrontLayout, so the theme, header and footer are
// already in place and the shop's info comes from the layout's own provider
// instead of a second fetch.
export default function StorefrontNotFound() {
  const shopInfo = useShopInfo();
  return <NotFoundContent shopName={shopInfo?.name ?? 'the shop'} whatsappNumber={shopInfo?.whatsappNumber ?? null} />;
}
