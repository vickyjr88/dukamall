import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Registered globally after JwtAuthGuard (see app.module.ts), so request.user
 * is already populated for any route that isn't @Public(). `role` there is
 * the caller's CURRENT membership role read from the database on every
 * request (JwtStrategy.validate), not the claim baked into the token -- so a
 * demotion or removal takes effect immediately rather than when the token
 * expires.
 *
 * Fails closed: a route that asks for a role and has no authenticated user
 * (for instance one marked both @Public() and @Roles()) is refused, never
 * waved through.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as { role?: string } | undefined;
    if (!user?.role || !required.includes(user.role)) {
      throw new ForbiddenException('Only the shop owner can do this.');
    }
    return true;
  }
}
