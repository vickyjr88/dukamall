import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

type AdminJwtPayload = { kind: 'admin'; sub: string; email: string };

/**
 * Third auth path alongside JwtAuthGuard (staff, scoped to one shop via
 * UserShop) and CustomerJwtGuard (a shopper, scoped to one shop by the
 * token's own shopId claim). An admin token carries no shopId at all -- it
 * operates across every shop -- so this guard doesn't check request.shopId
 * against anything; routes it protects must also be marked @NoShopScope()
 * so ShopScopeGuard doesn't demand an x-shop-id header that makes no sense
 * for a cross-shop operation.
 *
 * Re-checks isSuperAdmin on every request rather than trusting the JWT's own
 * claim of admin-ness (the payload only carries sub/email, deliberately --
 * see AdminAuthService) so that revoking someone's super-admin flag takes
 * effect immediately instead of only after their existing tokens expire.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing admin session');

    let payload: AdminJwtPayload;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (payload.kind !== 'admin' || !payload.sub) {
      throw new UnauthorizedException('Not an admin session');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.isSuperAdmin) {
      throw new UnauthorizedException('Admin access has been revoked');
    }

    // When the platform requires two-factor sign-in, an admin who hasn't set it
    // up yet can only reach the setup routes -- nothing else in the console.
    // (A session obtained before the requirement existed gets the same treatment.)
    if (process.env.ADMIN_REQUIRE_2FA === 'true' && !user.totpEnabledAt && !String(request.path ?? request.url).startsWith('/admin-auth/2fa')) {
      throw new ForbiddenException({ message: 'Two-factor sign-in is required. Set it up to continue.', code: 'two_factor_required' });
    }

    request.adminId = payload.sub;
    return true;
  }
}
