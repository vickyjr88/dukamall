import { BadRequestException, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ShopScopeGuard } from '../../src/common/shop-scope.guard';

function makeGuard(shops: Record<string, { status: string }>, noShopScope = false) {
  const findUnique = jest.fn(async ({ where }: any) => shops[where.id] ?? null);
  const reflector = { getAllAndOverride: () => noShopScope } as unknown as Reflector;
  const guard = new ShopScopeGuard(reflector, { shop: { findUnique } } as any);
  return { guard, findUnique };
}
function ctx(request: any): ExecutionContext {
  return { getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('ShopScopeGuard: tenant resolution', () => {
  it('refuses a request with no shop context', async () => {
    const { guard } = makeGuard({});
    await expect(guard.canActivate(ctx({ headers: {} }))).rejects.toThrow(BadRequestException);
  });

  it('lets a @NoShopScope route through with no shop', async () => {
    const { guard } = makeGuard({}, true);
    await expect(guard.canActivate(ctx({ headers: {} }))).resolves.toBe(true);
  });

  it('refuses a header naming a shop that does not exist', async () => {
    const { guard } = makeGuard({});
    await expect(guard.canActivate(ctx({ headers: { 'x-shop-id': 'nope' } }))).rejects.toThrow('Unknown shop');
  });

  it("uses the token's shop over a header naming a different one (no cross-tenant switching)", async () => {
    const { guard } = makeGuard({ A: { status: 'ACTIVE' }, B: { status: 'ACTIVE' } });
    const req: any = { headers: { 'x-shop-id': 'B' }, user: { shopId: 'A', role: 'OWNER' } };
    await guard.canActivate(ctx(req));
    expect(req.shopId).toBe('A');
  });
});

describe('ShopScopeGuard: suspended shops', () => {
  it('closes the public API for a suspended shop', async () => {
    const { guard } = makeGuard({ S1: { status: 'SUSPENDED' } });
    await expect(guard.canActivate(ctx({ headers: { 'x-shop-id': 'S1' } }))).rejects.toThrow(ForbiddenException);
  });

  it('closes it for a signed-in shopper too (customer routes carry no staff role)', async () => {
    const { guard } = makeGuard({ S2: { status: 'SUSPENDED' } });
    await expect(guard.canActivate(ctx({ headers: { 'x-shop-id': 'S2' }, customerId: 'c1' }))).rejects.toThrow(ForbiddenException);
  });

  it("still lets the shop's own staff in, so an owner can log in and see why", async () => {
    const { guard } = makeGuard({ S3: { status: 'SUSPENDED' } });
    const req: any = { headers: {}, user: { shopId: 'S3', role: 'OWNER' } };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    expect(req.shopId).toBe('S3');
  });

  it('serves an active shop normally', async () => {
    const { guard } = makeGuard({ OK1: { status: 'ACTIVE' } });
    await expect(guard.canActivate(ctx({ headers: { 'x-shop-id': 'OK1' } }))).resolves.toBe(true);
  });

  it('remembers the answer briefly instead of querying on every request', async () => {
    const { guard, findUnique } = makeGuard({ C1: { status: 'ACTIVE' } });
    const call = () => guard.canActivate(ctx({ headers: {}, user: { shopId: 'C1', role: 'STAFF' } }));
    // Staff are never blocked, so use a public request to exercise the status lookup.
    const pub = () => guard.canActivate(ctx({ headers: { 'x-shop-id': 'C1' } }));
    await pub(); await pub(); await pub();
    await call();
    // 1 existence check per public request + 1 status lookup in total (cached after the first).
    const statusLookups = findUnique.mock.calls.filter(([arg]: any) => arg.select?.status).length;
    expect(statusLookups).toBe(1);
  });
});
