import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { assertNotImpersonating, IMPERSONATION_TTL_SECONDS } from '../../src/common/impersonation';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { AdminService } from '../../src/admin/admin.service';

describe('assertNotImpersonating', () => {
  it('refuses account-level changes during a support session', () => {
    expect(() => assertNotImpersonating({ impersonatedBy: 'admin1' }, 'change the password')).toThrow(ForbiddenException);
    expect(() => assertNotImpersonating({ impersonatedBy: 'admin1' }, 'change the password')).toThrow(/platform support/);
  });
  it('allows them in a normal session', () => {
    expect(() => assertNotImpersonating({ impersonatedBy: null }, 'x')).not.toThrow();
    expect(() => assertNotImpersonating({}, 'x')).not.toThrow();
    expect(() => assertNotImpersonating(undefined, 'x')).not.toThrow();
  });
});

describe('"view as shop" sessions', () => {
  const jwt = new JwtService({ secret: 'unit-test-secret' });

  async function mint() {
    const prisma: any = {
      shop: { findUnique: async () => ({ id: 'shop1', slug: 'acme' }) },
      userShop: { findFirst: async () => ({ role: 'OWNER', user: { id: 'u1', email: 'owner@acme.test' } }) },
      adminAuditLog: { create: jest.fn(async () => ({})) },
    };
    const service = new AdminService(prisma, jwt, null as any, null as any);
    return { result: await service.impersonate('shop1', 'admin1'), prisma };
  }

  it('expires on its own, within the hour', async () => {
    const { result } = await mint();
    const claims: any = jwt.decode(result.access_token);
    expect(claims.exp - claims.iat).toBe(IMPERSONATION_TTL_SECONDS);
    expect(IMPERSONATION_TTL_SECONDS).toBeLessThanOrEqual(3600);
  });

  it('is marked with the admin who started it, and logged', async () => {
    const { result, prisma } = await mint();
    expect((jwt.decode(result.access_token) as any).imp).toBe('admin1');
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'shop.impersonated', adminId: 'admin1', shopId: 'shop1' }) }));
  });

  it('is reported by the staff strategy as an impersonated session', async () => {
    const { result } = await mint();
    const prisma: any = { userShop: { findUnique: async () => ({ shopId: 'shop1', role: 'OWNER', user: { id: 'u1', email: 'o@a.test', firstName: 'O', lastName: 'W' } }) } };
    const user = await new JwtStrategy(prisma).validate(jwt.decode(result.access_token) as any);
    expect(user.impersonatedBy).toBe('admin1');
  });

  it('is null for an ordinary login', async () => {
    const prisma: any = { userShop: { findUnique: async () => ({ shopId: 'shop1', role: 'OWNER', user: { id: 'u1', email: 'o@a.test', firstName: 'O', lastName: 'W' } }) } };
    const user = await new JwtStrategy(prisma).validate({ sub: 'u1', email: 'o@a.test', shopId: 'shop1', role: 'OWNER' } as any);
    expect(user.impersonatedBy).toBeNull();
  });

  it('refuses admin and customer tokens on staff routes', async () => {
    const strategy = new JwtStrategy({} as any);
    await expect(strategy.validate({ kind: 'admin', sub: 'a', email: 'a', shopId: '', role: '' } as any)).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate({ kind: 'customer', sub: 'c', email: 'c', shopId: 's', role: '' } as any)).rejects.toThrow(UnauthorizedException);
  });

  it('uses the live membership role, not the token claim (a demotion applies at once)', async () => {
    const prisma: any = { userShop: { findUnique: async () => ({ shopId: 'shop1', role: 'STAFF', user: { id: 'u1', email: 'o@a.test', firstName: 'O', lastName: 'W' } }) } };
    const user = await new JwtStrategy(prisma).validate({ sub: 'u1', email: 'o@a.test', shopId: 'shop1', role: 'OWNER' } as any);
    expect(user.role).toBe('STAFF');
  });

  it('rejects a token whose membership has been removed', async () => {
    const prisma: any = { userShop: { findUnique: async () => null } };
    await expect(new JwtStrategy(prisma).validate({ sub: 'u1', email: 'o', shopId: 'shop1', role: 'OWNER' } as any)).rejects.toThrow(UnauthorizedException);
  });
});
