import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The logged-in super-admin's user id, set by AdminJwtGuard. Only valid on a route also decorated with @UseGuards(AdminJwtGuard). */
export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().adminId;
});
