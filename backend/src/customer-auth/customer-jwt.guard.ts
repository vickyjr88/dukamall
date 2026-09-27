import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

type CustomerJwtPayload = { kind: 'customer'; sub: string; shopId: string };

/**
 * Separate from JwtAuthGuard/JwtStrategy on purpose -- those are wired to a
 * Passport strategy whose `validate()` explicitly THROWS on `kind:
 * 'customer'` (see auth/strategies/jwt.strategy.ts), so a customer token can
 * never authenticate through that path no matter what. This guard is the
 * customer-token equivalent: verifies the JWT itself (same secret, same
 * signing as CustomerAuthService.sign), requires kind === 'customer', and
 * attaches { customerId, shopId } to the request for handlers to read via
 * @CurrentCustomer().
 *
 * Applied per-route (@UseGuards(CustomerJwtGuard)), not globally like
 * JwtAuthGuard -- most storefront routes are genuinely public and must stay
 * that way; only the handful of "my account" routes need this.
 */
@Injectable()
export class CustomerJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing customer session');

    let payload: CustomerJwtPayload;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (payload.kind !== 'customer' || !payload.sub || !payload.shopId) {
      throw new UnauthorizedException('Not a customer session');
    }

    // A customer token's shopId must match the request's own resolved shop
    // (from ShopScopeGuard, via x-shop-id) -- otherwise a customer who signed
    // up at shop A could present that token while browsing shop B's domain
    // and be treated as logged in there.
    if (request.shopId && request.shopId !== payload.shopId) {
      throw new UnauthorizedException('Session does not match this shop');
    }

    request.customerId = payload.sub;
    request.shopId = payload.shopId;
    return true;
  }
}
