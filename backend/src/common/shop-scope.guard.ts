import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { NO_SHOP_SCOPE_KEY } from '../auth/decorators/no-shop-scope.decorator';

/**
 * Resolves which shop a request belongs to, and refuses to proceed if it
 * can't -- this is the platform's single tenant-isolation choke point (design
 * doc S:2.4). Every controller in the app goes through this guard globally
 * (see app.module.ts); nothing gets to a service method without a shopId
 * already attached to the request.
 *
 * Resolution order:
 *   1. A staff or customer JWT's own `shopId` claim, once Passport has
 *      already validated it (req.user is set by then).
 *   2. The `x-shop-id` header, sent by the storefront's own domain-resolution
 *      middleware (web/middleware.ts) on every public request.
 *
 * Only a route explicitly marked @NoShopScope() is allowed through with no
 * shopId at all -- NOT every @Public() route. @Public() just means "no auth
 * required"; most public routes (storefront browsing, checkout, cart leads,
 * product feeds) are still shop-scoped and must never run unscoped. This
 * distinction exists because of a real bug caught in local testing: treating
 * every @Public() route as exempt let a request with neither a JWT nor an
 * x-shop-id header reach the storefront's product listing, and
 * `prisma.product.findMany({ where: { shopId: undefined } })` silently drops
 * the filter -- returning every shop's products to nobody's request in
 * particular. Never repeat that: only @NoShopScope() routes (onboarding,
 * domain resolution, streaming a media object whose shopId is already in its
 * own key) skip this check; everything else fails closed.
 */
// How long a shop's suspended/not-suspended answer is remembered. Short, so a
// suspension (or reactivation) takes effect within seconds, but long enough that
// the check isn't a database read on every request.
const STATUS_TTL_MS = 15_000;
const statusCache = new Map<string, { suspended: boolean; at: number }>();

@Injectable()
export class ShopScopeGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  private async isSuspended(shopId: string): Promise<boolean> {
    const cached = statusCache.get(shopId);
    if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.suspended;
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { status: true } });
    const suspended = shop?.status === 'SUSPENDED';
    statusCache.set(shopId, { suspended, at: Date.now() });
    return suspended;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const claimedShopId = request.user?.shopId;
    const headerShopId = request.headers['x-shop-id'] as string | undefined;
    const shopId = claimedShopId || headerShopId;

    if (!shopId) {
      const noShopScope = this.reflector.getAllAndOverride<boolean>(NO_SHOP_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (noShopScope) return true;
      throw new BadRequestException('Missing shop context (x-shop-id header or shop-scoped token required)');
    }

    // A JWT's shopId is trusted as-is (it was signed by us). A header-supplied
    // shopId is client input and gets validated against a real shop before
    // anything downstream trusts it.
    if (!claimedShopId) {
      const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
      if (!shop) {
        throw new BadRequestException('Unknown shop');
      }
    }

    // A suspended shop is closed to the public here, not just on its web pages:
    // otherwise anyone could keep browsing, placing orders and paying through the
    // API directly with the shop's id. The shop's own staff are let through so an
    // owner can still log in, see why, and sort it out (see ShopService.resolveByHost).
    const isStaff = Boolean(request.user?.role);
    if (!isStaff && (await this.isSuspended(shopId))) {
      throw new ForbiddenException('This shop is currently unavailable.');
    }

    request.shopId = shopId;
    return true;
  }
}
