import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Every tenant-owned query in this app takes its shopId from here, never
 * from a client-supplied body field -- a shopId in a request body would let
 * one shop's staff read or write another shop's data just by editing the
 * payload. See ShopScopeGuard for how request.shopId is actually set.
 */
export const ShopId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.shopId;
});
