import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route as genuinely platform-wide -- no shop context exists or is
 * needed at all (shop onboarding, domain resolution, streaming a media
 * object whose shopId is already embedded in its own object key). This is
 * DELIBERATELY separate from @Public(): @Public() only means "no auth
 * required" -- most public routes (storefront browsing, checkout, cart
 * leads) are still shop-scoped and must never run without a resolved
 * shopId. Conflating the two was a real bug caught in testing: a request
 * with no x-shop-id header and no JWT hit a @Public() storefront route,
 * ShopScopeGuard let it through with shopId undefined, and Prisma's
 * `where: { shopId: undefined }` silently drops the filter entirely --
 * returning every shop's products to an unscoped request. See
 * ShopScopeGuard for the fix: only a route carrying BOTH @Public() and
 * @NoShopScope() skips shop resolution; every other route, public or not,
 * fails closed without one.
 */
export const NO_SHOP_SCOPE_KEY = 'noShopScope';
export const NoShopScope = () => SetMetadata(NO_SHOP_SCOPE_KEY, true);
