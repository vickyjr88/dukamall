import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminService } from '../../src/admin/admin.service';
import { PasswordResetService } from '../../src/password-reset/password-reset.service';
import { cleanup, close, makeShop, prisma } from './helpers';

const email = { send: jest.fn(async (..._args: any[]) => true) };
const jwt = new JwtService({ secret: process.env.JWT_SECRET });
const service = new AdminService(prisma, jwt, null as any, email as any, new PasswordResetService(prisma, email as any));
const rand = () => Math.random().toString(36).slice(2, 8);
const users: string[] = [];

async function user(over: Record<string, unknown> = {}) {
  const u = await prisma.user.create({ data: { email: `it-${rand()}@test.dev`, passwordHash: await bcrypt.hash('password123', 4), firstName: 'T', lastName: 'U', ...over } });
  users.push(u.id);
  return u;
}

beforeEach(() => email.send.mockClear());
afterAll(async () => {
  await cleanup();
  await prisma.passwordResetToken.deleteMany({ where: { accountId: { in: users } } });
  await prisma.adminAuditLog.deleteMany({ where: { adminId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await close();
});

describe('support tool: change a staff role', () => {
  it('promotes and demotes, and logs each change', async () => {
    const shop = await makeShop(); const admin = await user({ isSuperAdmin: true });
    const owner = await user(); const cashier = await user();
    await prisma.userShop.createMany({ data: [{ userId: owner.id, shopId: shop.id, role: 'OWNER' }, { userId: cashier.id, shopId: shop.id, role: 'STAFF' }] });
    await service.changeStaffRole(shop.id, admin.id, cashier.id, 'OWNER');
    expect((await prisma.userShop.findUniqueOrThrow({ where: { userId_shopId: { userId: cashier.id, shopId: shop.id } } })).role).toBe('OWNER');
    await service.changeStaffRole(shop.id, admin.id, owner.id, 'STAFF'); // fine: cashier is now an owner too
    expect(await prisma.adminAuditLog.count({ where: { adminId: admin.id, shopId: shop.id, action: 'staff.role_changed' } })).toBe(2);
  });

  it("refuses to demote a shop's only owner", async () => {
    const shop = await makeShop(); const admin = await user({ isSuperAdmin: true }); const owner = await user();
    await prisma.userShop.create({ data: { userId: owner.id, shopId: shop.id, role: 'OWNER' } });
    await expect(service.changeStaffRole(shop.id, admin.id, owner.id, 'STAFF')).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.userShop.findUniqueOrThrow({ where: { userId_shopId: { userId: owner.id, shopId: shop.id } } })).role).toBe('OWNER');
  });

  it('will not change the role of someone who is not in that shop', async () => {
    const shopA = await makeShop(); const shopB = await makeShop(); const admin = await user({ isSuperAdmin: true }); const person = await user();
    await prisma.userShop.create({ data: { userId: person.id, shopId: shopB.id, role: 'STAFF' } });
    await expect(service.changeStaffRole(shopA.id, admin.id, person.id, 'OWNER')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('support tool: send a password reset', () => {
  it("emails a link to the person's own address only, and never returns it to the operator", async () => {
    const admin = await user({ isSuperAdmin: true }); const target = await user();
    const result: any = await service.sendPasswordReset(admin.id, target.id);
    expect(result.sent).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/token/i);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0]).toBe(target.email);
    expect(email.send.mock.calls[0][2]).toContain('reset-password?token=');
    expect(await prisma.passwordResetToken.count({ where: { accountId: target.id } })).toBe(1);
    expect(await prisma.adminAuditLog.count({ where: { adminId: admin.id, action: 'user.reset_sent' } })).toBe(1);
  });

  it('stops after 3 links in an hour, so it cannot flood someone\'s inbox', async () => {
    const admin = await user({ isSuperAdmin: true }); const target = await user();
    for (let i = 0; i < 3; i++) await service.sendPasswordReset(admin.id, target.id);
    await expect(service.sendPasswordReset(admin.id, target.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(email.send).toHaveBeenCalledTimes(3);
  });

  it('reports honestly when the email could not be sent', async () => {
    email.send.mockResolvedValueOnce(false);
    const admin = await user({ isSuperAdmin: true }); const target = await user();
    const result: any = await service.sendPasswordReset(admin.id, target.id);
    expect(result.sent).toBe(false);
    expect(result.message).toMatch(/could not be sent/);
  });

  it('404s for an unknown user', async () => {
    const admin = await user({ isSuperAdmin: true });
    await expect(service.sendPasswordReset(admin.id, 'nobody')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('support tool: edit shop details', () => {
  it('changes the allowed fields, clears blanks, logs which fields changed, and leaves the address alone', async () => {
    const shop = await makeShop({ whatsappNumber: '254700000000', notificationEmail: 'old@x.test' });
    const admin = await user({ isSuperAdmin: true });
    const updated: any = await service.updateShopDetails(shop.id, admin.id, { name: '  New Name ', whatsappNumber: '', notificationEmail: null, orderPrefix: 'NEW' });
    expect(updated).toMatchObject({ name: 'New Name', whatsappNumber: null, notificationEmail: null, orderPrefix: 'NEW', slug: shop.slug });
    const log = await prisma.adminAuditLog.findFirst({ where: { shopId: shop.id, action: 'shop.details_updated' } });
    expect((log!.metadata as any).fields.sort()).toEqual(['name', 'notificationEmail', 'orderPrefix', 'whatsappNumber']);
  });

  it('does not log a change when nothing actually changed', async () => {
    const shop = await makeShop();
    const admin = await user({ isSuperAdmin: true });
    await service.updateShopDetails(shop.id, admin.id, { name: shop.name, currency: shop.currency });
    expect(await prisma.adminAuditLog.count({ where: { shopId: shop.id, action: 'shop.details_updated' } })).toBe(0);
  });

  it('404s for an unknown shop', async () => {
    const admin = await user({ isSuperAdmin: true });
    await expect(service.updateShopDetails('nope', admin.id, { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
