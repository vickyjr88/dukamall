import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { Roles } from '../../src/auth/decorators/roles.decorator';

// RolesGuard reads the metadata @Roles() sets, so these use a real decorated class.
class OwnerOnlyController { @Roles('OWNER') ownerAction() {} openAction() {} }
@Roles('OWNER') class WholeControllerOwnerOnly { anything() {} }

function ctx(handler: Function, cls: Function, user?: { role?: string }): ExecutionContext {
  return { getHandler: () => handler, getClass: () => cls, switchToHttp: () => ({ getRequest: () => ({ user }) }) } as unknown as ExecutionContext;
}
const guard = new RolesGuard(new Reflector());

describe('RolesGuard', () => {
  it('lets an owner into an owner-only route', () => {
    expect(guard.canActivate(ctx(OwnerOnlyController.prototype.ownerAction, OwnerOnlyController, { role: 'OWNER' }))).toBe(true);
  });

  it('refuses a cashier (STAFF) on an owner-only route', () => {
    expect(() => guard.canActivate(ctx(OwnerOnlyController.prototype.ownerAction, OwnerOnlyController, { role: 'STAFF' }))).toThrow(ForbiddenException);
  });

  it('fails closed when there is no authenticated user at all', () => {
    expect(() => guard.canActivate(ctx(OwnerOnlyController.prototype.ownerAction, OwnerOnlyController, undefined))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(OwnerOnlyController.prototype.ownerAction, OwnerOnlyController, {}))).toThrow(ForbiddenException);
  });

  it('refuses an unknown role value', () => {
    expect(() => guard.canActivate(ctx(OwnerOnlyController.prototype.ownerAction, OwnerOnlyController, { role: 'ADMIN' }))).toThrow(ForbiddenException);
  });

  it('leaves routes without @Roles() open to any staff member', () => {
    expect(guard.canActivate(ctx(OwnerOnlyController.prototype.openAction, OwnerOnlyController, { role: 'STAFF' }))).toBe(true);
  });

  it('applies a class-level @Roles() to every handler in the controller', () => {
    expect(() => guard.canActivate(ctx(WholeControllerOwnerOnly.prototype.anything, WholeControllerOwnerOnly, { role: 'STAFF' }))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(WholeControllerOwnerOnly.prototype.anything, WholeControllerOwnerOnly, { role: 'OWNER' }))).toBe(true);
  });
});
