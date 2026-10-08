import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AdminService } from '../../src/admin/admin.service';
import { AdminAuthService } from '../../src/admin-auth/admin-auth.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { ShopScopeGuard } from '../../src/common/shop-scope.guard';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { TrialService } from '../../src/trial/trial.service';
import { cleanup, close, makeShop, prisma } from './helpers';

const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const email = { send: jest.fn(async (..._args: any[]) => true) };
const ctx = (request: any) => ({ getHandler: () => null, getClass: () => null, switchToHttp: () => ({ getRequest: () => request }) }) as any;
const rand = () => Math.random().toString(36).slice(2, 8);
const cleanupUsers: string[] = [];

async function makeUser(over: Record<string, unknown> = {}) {
  const user = await prisma.user.create({ data: { email: `it-${rand()}@test.dev`, passwordHash: await bcrypt.hash('password123', 4), firstName: 'T', lastName: 'U', ...over } });
  cleanupUsers.push(user.id);
  return user;
}

afterAll(async () => {
  await cleanup();
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { in: cleanupUsers } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupUsers } } });
  await close();
});

describe('suspension, against the real database', () => {
  const guard = () => new ShopScopeGuard({ getAllAndOverride: () => false } as unknown as Reflector, prisma);

  it('closes a suspended shop to the public but not to its own staff', async () => {
    const shop = await makeShop({ status: 'SUSPENDED' });
    await expect(guard().canActivate(ctx({ headers: { 'x-shop-id': shop.id } }))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard().canActivate(ctx({ headers: {}, user: { shopId: shop.id, role: 'OWNER' } }))).resolves.toBe(true);
  });

  it('serves a shop that is not suspended', async () => {
    const shop = await makeShop({ status: 'ACTIVE' });
    await expect(guard().canActivate(ctx({ headers: { 'x-shop-id': shop.id } }))).resolves.toBe(true);
  });

  it('admin setStatus suspends, emails the owners, and logs it', async () => {
    const shop = await makeShop();
    const owner = await makeUser();
    const admin = await makeUser({ isSuperAdmin: true });
    await prisma.userShop.create({ data: { userId: owner.id, shopId: shop.id, role: 'OWNER' } });
    email.send.mockClear();
    const service = new AdminService(prisma, jwt, null as any, email as any);
    await service.setStatus(shop.id, admin.id, 'SUSPENDED', 'non-payment');
    expect((await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe('SUSPENDED');
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0]).toBe(owner.email);
    expect(JSON.stringify(email.send.mock.calls[0])).not.toContain('non-payment'); // the internal reason is never emailed
    expect(await prisma.adminAuditLog.count({ where: { shopId: shop.id, action: 'shop.status_changed', adminId: admin.id } })).toBe(1);
    await prisma.userShop.deleteMany({ where: { shopId: shop.id } });
  });
});

describe('"view as shop" against the real database', () => {
  it('mints a one-hour owner session that the staff strategy recognises as support', async () => {
    const shop = await makeShop();
    const owner = await makeUser();
    const admin = await makeUser({ isSuperAdmin: true });
    await prisma.userShop.create({ data: { userId: owner.id, shopId: shop.id, role: 'OWNER' } });
    const service = new AdminService(prisma, jwt, null as any, email as any);
    const { access_token } = await service.impersonate(shop.id, admin.id);
    const claims: any = jwt.decode(access_token);
    expect(claims.exp - claims.iat).toBe(3600);
    const user = await new JwtStrategy(prisma).validate(claims);
    expect(user).toMatchObject({ id: owner.id, shopId: shop.id, role: 'OWNER', impersonatedBy: admin.id });
    expect(await prisma.adminAuditLog.count({ where: { adminId: admin.id, action: 'shop.impersonated', shopId: shop.id } })).toBe(1);
    await prisma.userShop.deleteMany({ where: { shopId: shop.id } });
  });

  it('stops working the moment the membership is removed', async () => {
    const shop = await makeShop();
    const owner = await makeUser();
    const admin = await makeUser({ isSuperAdmin: true });
    await prisma.userShop.create({ data: { userId: owner.id, shopId: shop.id, role: 'OWNER' } });
    const { access_token } = await new AdminService(prisma, jwt, null as any, email as any).impersonate(shop.id, admin.id);
    await prisma.userShop.deleteMany({ where: { shopId: shop.id } });
    await expect(new JwtStrategy(prisma).validate(jwt.decode(access_token) as any)).rejects.toThrow();
  });
});

describe('signup against the real database', () => {
  it('does not add a shop to an existing account without its password, and dates the trial', async () => {
    const existing = await makeUser();
    const service = new OnboardingService(prisma);
    const slug = `it-${rand()}`;
    await expect(service.createShop({ shopName: 'X', slug, ownerEmail: existing.email.toUpperCase(), ownerFirstName: 'A', ownerLastName: 'B', password: 'wrong-guess-1' })).rejects.toThrow(/already has an account/);
    expect(await prisma.shop.count({ where: { slug } })).toBe(0);

    const fresh = `it-${rand()}@test.dev`;
    const created = await service.createShop({ shopName: 'Fresh', slug, ownerEmail: fresh.toUpperCase(), ownerFirstName: 'A', ownerLastName: 'B', password: 'password123' });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: created.ownerUserId } });
    cleanupUsers.push(stored.id);
    expect(stored.email).toBe(fresh);                       // stored lowercase
    expect(created.shop.trialEndsAt).not.toBeNull();
    await prisma.userShop.deleteMany({ where: { shopId: created.shop.id } });
    await prisma.shop.delete({ where: { id: created.shop.id } });
  });
});

describe('admin sign-in', () => {
  it('requires the second factor when it is on, and logs failures only for real admins', async () => {
    const { generateTotpSecret, totpCode } = await import('../../src/common/totp');
    const { encryptSecret } = await import('../../src/common/secrets');
    const secret = generateTotpSecret();
    const admin = await makeUser({ isSuperAdmin: true, totpSecret: encryptSecret(secret), totpEnabledAt: new Date() });
    const auth = new AdminAuthService(prisma, jwt);

    const first: any = await auth.login(admin.email, 'password123');
    expect(first.requiresTwoFactor).toBe(true);
    expect(first.access_token).toBeUndefined();

    await expect(auth.verifyTwoFactor(first.challengeToken, '000000')).rejects.toThrow();
    const ok: any = await auth.verifyTwoFactor(first.challengeToken, totpCode(secret, Math.floor(Date.now() / 30000)));
    expect(ok.access_token).toBeDefined();

    // Replaying the same code fails, and a staff-style token can't pass as a challenge.
    await expect(auth.verifyTwoFactor(first.challengeToken, totpCode(secret, Math.floor(Date.now() / 30000)))).rejects.toThrow();
    await expect(auth.verifyTwoFactor(jwt.sign({ sub: admin.id }), '123456')).rejects.toThrow();

    expect(await prisma.adminAuditLog.count({ where: { adminId: admin.id, action: 'admin.login_failed' } })).toBeGreaterThanOrEqual(1);
  });

  it('does not give a non-admin any hint they exist, or a log entry', async () => {
    const user = await makeUser();
    await expect(new AdminAuthService(prisma, jwt).login(user.email, 'password123')).rejects.toThrow('Invalid credentials');
    expect(await prisma.adminAuditLog.count({ where: { adminId: user.id } })).toBe(0);
  });
});

describe('trial sweep against the real database', () => {
  it('sends each reminder once and never closes a shop unless auto-close is on', async () => {
    const shop = await makeShop({ billingPlan: 'TRIAL', status: 'TRIAL', trialEndsAt: new Date(Date.now() + 2 * 86_400_000) });
    const owner = await makeUser();
    await prisma.userShop.create({ data: { userId: owner.id, shopId: shop.id, role: 'OWNER' } });
    await prisma.platformSettings.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', suspendExpiredTrials: false }, update: { suspendExpiredTrials: false } });
    email.send.mockClear();
    const sweeper = new TrialService(prisma, email as any);

    await sweeper.sweep();
    await sweeper.sweep();
    const sentToOwner = email.send.mock.calls.filter((c: any[]) => c[0] === owner.email);
    expect(sentToOwner).toHaveLength(1);
    expect(sentToOwner[0][1]).toMatch(/ends in 3 days/);

    await prisma.shop.update({ where: { id: shop.id }, data: { trialEndsAt: new Date(Date.now() - 60 * 86_400_000) } });
    await sweeper.sweep();
    expect((await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe('TRIAL');

    await prisma.platformSettings.update({ where: { id: 'singleton' }, data: { suspendExpiredTrials: true, trialGraceDays: 7 } });
    await sweeper.sweep();
    expect((await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe('SUSPENDED');
    const audit = await prisma.adminAuditLog.findFirst({ where: { shopId: shop.id, adminId: null } });
    expect(audit?.metadata).toMatchObject({ automatic: true });
    await prisma.userShop.deleteMany({ where: { shopId: shop.id } });
  });
});
