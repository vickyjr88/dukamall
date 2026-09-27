import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Best-effort customer id from the Authorization header, for routes that
 * work for both guests and logged-in customers (checkout) -- unlike
 * CustomerJwtGuard, a missing or invalid token here is not an error, it just
 * means "guest checkout." Never trust a client-supplied customerId in a
 * request body for the same reason CheckoutService already never has: it
 * would let anyone attach an order to someone else's account by guessing an
 * id.
 */
export const OptionalCustomer = createParamDecorator((_: unknown, ctx: ExecutionContext): string | null => {
  const request = ctx.switchToHttp().getRequest();
  const authHeader = request.headers['authorization'] as string | undefined;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (!token) return null;

  try {
    // Re-instantiating JwtService here (rather than injecting it) keeps this
    // decorator usable without wiring JwtModule into every module that wants
    // "logged in or guest" -- verify() only needs the shared secret, not any
    // other app state.
    const jwtService = new JwtService({ secret: process.env.JWT_SECRET || 'dev-secret-change-me' });
    const payload = jwtService.verify(token);
    if (payload?.kind !== 'customer' || !payload.sub) return null;
    return payload.sub as string;
  } catch {
    return null;
  }
});
