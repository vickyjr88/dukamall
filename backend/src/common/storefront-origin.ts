/**
 * Where a shop's customer browser is, as opposed to where the API is --
 * needed for Paystack callback URLs. Unlike drip-crm's single-tenant version
 * (one STOREFRONT_ORIGIN env var), this is genuinely per-shop: each shop has
 * its own domain, so the caller must supply the resolved Shop, not just its id.
 */
import { Shop } from '@prisma/client';

export function storefrontOriginForShop(shop: Shop): string {
  if (shop.customDomain) return `https://${shop.customDomain}`;
  const platformDomain = process.env.PLATFORM_DOMAIN || 'dukamall.app';
  return `https://${shop.slug}.${platformDomain}`;
}
