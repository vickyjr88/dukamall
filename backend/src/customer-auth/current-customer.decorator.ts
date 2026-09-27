import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The logged-in customer's id, set by CustomerJwtGuard. Only valid on a route also decorated with @UseGuards(CustomerJwtGuard). */
export const CurrentCustomer = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().customerId;
});
