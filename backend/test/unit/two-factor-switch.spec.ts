import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminAuthService } from '../../src/admin-auth/admin-auth.service';
import { AdminJwtGuard } from '../../src/admin-auth/admin-jwt.guard';
import { adminTwoFactorEnabled, adminTwoFactorRequired } from '../../src/common/feature-flags';
import { encryptSecret } from '../../src/common/secrets';
import { generateTotpSecret } from '../../src/common/totp';

const jwt = new JwtService({ secret: 'unit-test-secret' });
const reset = () => { delete process.env.ADMIN_2FA_ENABLED; delete process.env.ADMIN_REQUIRE_2FA; };
beforeEach(reset);
afterAll(reset);

describe('the 2FA master switch (ADMIN_2FA_ENABLED)', () => {
  it('is OFF unless explicitly turned on', () => {
    expect(adminTwoFactorEnabled()).toBe(false);
    process.env.ADMIN_2FA_ENABLED = 'false'; expect(adminTwoFactorEnabled()).toBe(false);
    process.env.ADMIN_2FA_ENABLED = '1'; expect(adminTwoFactorEnabled()).toBe(false);
    process.env.ADMIN_2FA_ENABLED = 'TRUE'; expect(adminTwoFactorEnabled()).toBe(true);
  });

  it('"required" does nothing unless the feature itself is on', () => {
    process.env.ADMIN_REQUIRE_2FA = 'true';
    expect(adminTwoFactorRequired()).toBe(false);
    process.env.ADMIN_2FA_ENABLED = 'true';
    expect(adminTwoFactorRequired()).toBe(true);
  });

  async function authWithEnrolledAdmin() {
    const user = { id: 'a1', email: 'a@x.test', isSuperAdmin: true, passwordHash: await bcrypt.hash('pw-123456', 4), totpEnabledAt: new Date(), totpSecret: encryptSecret(generateTotpSecret()), totpLastStep: null, totpRecoveryHashes: [] };
    const prisma: any = {
      user: { findFirst: async () => user, findUnique: async () => user, findUniqueOrThrow: async () => user, update: async () => user },
      adminAuditLog: { create: async () => ({}) },
    };
    return new AdminAuthService(prisma, jwt);
  }

  it('when OFF, even an enrolled admin signs in with a password only', async () => {
    const result: any = await (await authWithEnrolledAdmin()).login('a@x.test', 'pw-123456');
    expect(result.requiresTwoFactor).toBeUndefined();
    expect(result.access_token).toBeDefined();
  });

  it('when ON, an enrolled admin gets a challenge and no session', async () => {
    process.env.ADMIN_2FA_ENABLED = 'true';
    const result: any = await (await authWithEnrolledAdmin()).login('a@x.test', 'pw-123456');
    expect(result.requiresTwoFactor).toBe(true);
    expect(result.access_token).toBeUndefined();
  });

  it('when OFF, the status route reports it unavailable and the setup routes do not exist', async () => {
    const auth = await authWithEnrolledAdmin();
    expect(await auth.twoFactorStatus('a1')).toMatchObject({ available: false, enabled: false, required: false });
    await expect(auth.beginSetup('a1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(auth.enable('a1', '123456')).rejects.toBeInstanceOf(NotFoundException);
    await expect(auth.disable('a1', 'pw', '123456')).rejects.toBeInstanceOf(NotFoundException);
    await expect(auth.regenerateRecoveryCodes('a1', '123456')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a challenge ticket issued before the switch was turned off no longer works', async () => {
    const auth = await authWithEnrolledAdmin();
    const ticket = jwt.sign({ kind: 'admin-2fa', sub: 'a1' });
    await expect(auth.verifyTwoFactor(ticket, '123456')).rejects.toThrow(/log in again/i);
  });
});

describe('AdminJwtGuard enforcement', () => {
  const ctx = (path: string, token: string): ExecutionContext => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` }, path }) }),
  }) as unknown as ExecutionContext;
  const guardFor = (user: any) => new AdminJwtGuard(jwt, { user: { findUnique: async () => user } } as any);
  const token = jwt.sign({ kind: 'admin', sub: 'a1', email: 'a@x.test' });

  it('does not enforce anything when the feature is off, even if REQUIRE is set', async () => {
    process.env.ADMIN_REQUIRE_2FA = 'true';
    await expect(guardFor({ isSuperAdmin: true, totpEnabledAt: null }).canActivate(ctx('/admin/shops', token))).resolves.toBe(true);
  });

  it('when required, locks an un-enrolled admin to the setup routes', async () => {
    process.env.ADMIN_2FA_ENABLED = 'true'; process.env.ADMIN_REQUIRE_2FA = 'true';
    const g = guardFor({ isSuperAdmin: true, totpEnabledAt: null });
    await expect(g.canActivate(ctx('/admin/shops', token))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(g.canActivate(ctx('/admin-auth/2fa/setup', token))).resolves.toBe(true);
  });

  it('when required, lets an enrolled admin through', async () => {
    process.env.ADMIN_2FA_ENABLED = 'true'; process.env.ADMIN_REQUIRE_2FA = 'true';
    await expect(guardFor({ isSuperAdmin: true, totpEnabledAt: new Date() }).canActivate(ctx('/admin/shops', token))).resolves.toBe(true);
  });

  it('never accepts a login challenge ticket as a session', async () => {
    const ticket = jwt.sign({ kind: 'admin-2fa', sub: 'a1' });
    await expect(guardFor({ isSuperAdmin: true }).canActivate(ctx('/admin/shops', ticket))).rejects.toThrow();
  });

  it('still refuses a revoked admin', async () => {
    await expect(guardFor({ isSuperAdmin: false }).canActivate(ctx('/admin/shops', token))).rejects.toThrow();
  });
});
