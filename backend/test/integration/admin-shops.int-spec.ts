import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from '../../src/admin/admin.service';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { cleanup, close, makeOrder, makeShop, makeVariant, prisma } from './helpers';

const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const email = { send: jest.fn(async (..._a: any[]) => true) };
const passwordReset = { sendStaffResetLink: jest.fn(async (_u: any) => 'sent' as const) };
const service = new AdminService(prisma, jwt, null as any, email as any, passwordReset as any, new OnboardingService(prisma));
const rand = () => Math.random().toString(36).slice(2, 8);
const tag = `Zfeat${rand()}`;
const createdSlugs: string[] = [];
const createdAdmins: string[] = [];

async function admin() {
  const a = await prisma.user.create({ data: { email: `it-${rand()}@test.dev`, passwordHash: await bcrypt.hash('password123', 4), firstName: 'A', lastName: 'D', isSuperAdmin: true } });
  createdAdmins.push(a.id);
  return a;
}

afterAll(async () => {
  await prisma.shareEvent.deleteMany({ where: { shop: { name: { startsWith: tag } } } });
  const shops = await prisma.shop.findMany({ where: { slug: { in: createdSlugs } }, select: { id: true } });
  for (const s of shops) {
    await prisma.userShop.deleteMany({ where: { shopId: s.id } });
    await prisma.adminAuditLog.deleteMany({ where: { shopId: s.id } });
    await prisma.productCategory.deleteMany({ where: { shopId: s.id } });
    await prisma.shop.delete({ where: { id: s.id } }).catch(() => {});
  }
  await cleanup();
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { in: createdAdmins } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'it-' } } });
  await close();
});

const row = (r: { shops: Array<{ name: string; features: Array<{ key: string; state: string }>; coverage: any }> }, name: string) => r.shops.find((s) => s.name === name)!;
const stateOf = (r: any, key: string) => r.features.find((f: any) => f.key === key).state;

describe('the admin Shops list, against the real database', () => {
  it('shows what each shop has set up, filters by it, counts the chips, and never returns a secret', async () => {
    const ready = await makeShop({ name: `${tag} Ready`, paystackSecretKey: 'sk_test_x', paystackPublicKey: 'pk_test_x', whatsappNumber: '254700111222', address: 'Shop F53', metaPixelId: '123456789012345' });
    await makeVariant(ready.id, 1000, 5, 'Boots');
    await makeOrder(ready.id, { status: 'PAID' });
    await prisma.shareEvent.create({ data: { shopId: ready.id, userEmail: 'o@x.test', channel: 'whatsapp', kind: 'PRODUCT' } });
    // Posting is switched on but nothing is connected: a problem.
    await prisma.socialSetting.create({ data: { shopId: ready.id, facebookEnabled: true } });
    const bare = await makeShop({ name: `${tag} Bare` });

    const all = await service.listShops({ search: tag, sort: 'name', dir: 'asc' });
    expect(all.total).toBe(2);
    expect(row(all as any, `${tag} Ready`).coverage).toMatchObject({ basics: { done: 3, total: 3 }, problems: 1 });
    expect(stateOf(row(all as any, `${tag} Ready`), 'payments')).toBe('working');
    expect(stateOf(row(all as any, `${tag} Ready`), 'share')).toBe('working');
    expect(stateOf(row(all as any, `${tag} Ready`), 'tracking')).toBe('working');
    expect(stateOf(row(all as any, `${tag} Ready`), 'posting')).toBe('problem');
    expect(row(all as any, `${tag} Bare`).coverage.basics.done).toBe(0);

    expect((await service.listShops({ search: tag, needs: 'problem' })).shops.map((s) => s.name)).toEqual([`${tag} Ready`]);
    expect((await service.listShops({ search: tag, needs: 'basics' })).shops.map((s) => s.name)).toEqual([`${tag} Bare`]);
    expect((await service.listShops({ search: tag, feature: 'payments', featureState: 'setup' })).shops.map((s) => s.name)).toEqual([`${tag} Bare`]);
    expect((await service.listShops({ search: tag, feature: 'share' })).shops.map((s) => s.name)).toEqual([`${tag} Ready`]);
    expect((await service.listShops({ search: tag, feature: 'nonsense' })).total).toBe(2);

    // Least set up first.
    expect((await service.listShops({ search: tag, sort: 'setup', dir: 'asc' })).shops[0].name).toBe(`${tag} Bare`);

    // The chips count each status with the other filters as they are; the status filter itself does not shrink them.
    await prisma.shop.update({ where: { id: bare.id }, data: { status: 'SUSPENDED' } });
    const suspended = await service.listShops({ search: tag, status: 'SUSPENDED' });
    expect(suspended.total).toBe(1);
    expect(suspended.facets).toMatchObject({ all: 2, SUSPENDED: 1, TRIAL: 1, problems: 1, missingBasics: 1 });

    expect(JSON.stringify(all)).not.toContain('sk_test_x');
    expect(JSON.stringify(all)).not.toContain('pk_test_x');
  });

  it('gives the shop page its features, its real address, and no keys', async () => {
    const shop = await makeShop({ name: `${tag} Detail`, customDomain: 'detail.test', paystackSecretKey: 'sk_test_y', paystackPublicKey: 'pk_test_y' });
    const d: any = await service.getShop(shop.id);
    expect(d.storefrontUrl).toBe('https://detail.test');
    expect(d.features.find((f: any) => f.key === 'domain').state).toBe('working');
    expect(d.coverage.basics.total).toBe(3);
    expect(d.paymentReady).toBe(true);
    expect(JSON.stringify(d)).not.toContain('sk_test_y');
  });

  it('exports the feature columns', async () => {
    await makeShop({ name: `${tag} Export` });
    const rows = await service.exportShopsRows({ search: `${tag} Export` });
    expect(rows[0]).toMatchObject({ basicsDone: '0/3', extrasOn: '0/9', problems: 0 });
  });
});

describe('an operator creating a shop', () => {
  it('makes the shop and a new owner with a password nobody knows, emails a reset link, and logs it', async () => {
    const a = await admin();
    const slug = `it-${rand()}${rand()}`;
    createdSlugs.push(slug);
    passwordReset.sendStaffResetLink.mockClear();
    const r = await service.createShop(a.id, { shopName: `${tag} Created`, slug, ownerEmail: `It-${rand()}@Test.Dev`, ownerFirstName: 'Wanjiru', ownerLastName: 'K', sections: ['footwear'] });
    expect(r).toMatchObject({ slug, newAccount: true, resetLink: 'sent' });
    expect(passwordReset.sendStaffResetLink).toHaveBeenCalledTimes(1);
    const shop = await prisma.shop.findUniqueOrThrow({ where: { slug }, include: { staff: { include: { user: true } } } });
    expect(shop.status).toBe('TRIAL');
    expect(shop.trialEndsAt).not.toBeNull();
    expect(shop.staff).toHaveLength(1);
    expect(shop.staff[0].role).toBe('OWNER');
    expect(shop.staff[0].user.email).toBe(shop.staff[0].user.email.toLowerCase());
    // Nobody can log in with a guessable password.
    expect(await bcrypt.compare('password', shop.staff[0].user.passwordHash)).toBe(false);
    expect(await prisma.productCategory.count({ where: { shopId: shop.id } })).toBeGreaterThan(0);
    expect(await prisma.adminAuditLog.count({ where: { adminId: a.id, shopId: shop.id, action: 'shop.created' } })).toBe(1);
  });

  it('adds a second shop to an existing owner without a new password or email', async () => {
    const a = await admin();
    const owner = await prisma.user.create({ data: { email: `it-${rand()}@test.dev`, passwordHash: await bcrypt.hash('keep-this-1', 4), firstName: 'O', lastName: 'W' } });
    const slug = `it-${rand()}${rand()}`;
    createdSlugs.push(slug);
    passwordReset.sendStaffResetLink.mockClear();
    const r = await service.createShop(a.id, { shopName: `${tag} Second`, slug, ownerEmail: owner.email, ownerFirstName: 'X', ownerLastName: 'Y' });
    expect(r).toMatchObject({ newAccount: false, resetLink: 'not_needed' });
    expect(passwordReset.sendStaffResetLink).not.toHaveBeenCalled();
    expect(await bcrypt.compare('keep-this-1', (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash)).toBe(true);
  });

  it('refuses a taken, reserved or malformed address, and applies a paid plan', async () => {
    const a = await admin();
    const taken = await makeShop();
    const input = { shopName: `${tag} X`, ownerEmail: `it-${rand()}@test.dev`, ownerFirstName: 'A', ownerLastName: 'B' };
    await expect(service.createShop(a.id, { ...input, slug: taken.slug })).rejects.toThrow('already taken');
    await expect(service.createShop(a.id, { ...input, slug: 'admin' })).rejects.toThrow();
    await expect(service.createShop(a.id, { ...input, slug: 'UPPER_case' })).rejects.toThrow();
    const slug = `it-${rand()}${rand()}`;
    createdSlugs.push(slug);
    await service.createShop(a.id, { ...input, slug, billingPlan: 'PRO' });
    expect(await prisma.shop.findUniqueOrThrow({ where: { slug } })).toMatchObject({ billingPlan: 'PRO', status: 'ACTIVE', trialEndsAt: null });
  });
});
