import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { validate } from 'class-validator';
import { CreateShopDto } from '../../src/onboarding/onboarding.dto';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { isReservedSlug } from '../../src/common/reserved-slugs';

const dto = (over: Partial<CreateShopDto> = {}): CreateShopDto =>
  Object.assign(new CreateShopDto(), { shopName: 'Acme', slug: 'acme-shoes', ownerEmail: 'New@Owner.test', ownerFirstName: 'A', ownerLastName: 'B', password: 'password123' }, over);

describe('signup: reserved shop addresses', () => {
  it.each(['www', 'admin', 'api', 'support', 'login', 'billing', 'mail', 'portal'])('%s is reserved', (slug) => {
    expect(isReservedSlug(slug)).toBe(true);
  });
  it('rejects a reserved slug at validation', async () => {
    const errors = await validate(dto({ slug: 'support' }));
    expect(errors.some((e) => e.property === 'slug')).toBe(true);
  });
  it('accepts a normal slug', async () => {
    expect(await validate(dto())).toHaveLength(0);
  });
  it('rejects uppercase, spaces and too-short slugs', async () => {
    for (const slug of ['Acme', 'my shop', 'ab']) expect((await validate(dto({ slug }))).some((e) => e.property === 'slug')).toBe(true);
  });
});

describe('OnboardingService.createShop: existing accounts', () => {
  async function setup(existing: { passwordHash: string } | null) {
    const tx = {
      shop: { create: jest.fn(async ({ data }: any) => ({ id: 's1', ...data })) },
      user: { create: jest.fn(async ({ data }: any) => ({ id: 'u-new', ...data })) },
      userShop: { create: jest.fn(async () => ({})) },
    };
    const prisma: any = {
      shop: { findUnique: async () => null },
      // findUserByEmail uses findFirst
      user: { findFirst: async () => (existing ? { id: 'u-old', email: 'new@owner.test', ...existing } : null) },
      platformSettings: { findUnique: async () => ({ trialDays: 10 }) },
      $transaction: async (fn: any) => fn(tx),
    };
    return { service: new OnboardingService(prisma), tx };
  }

  it("refuses to attach a new shop to someone else's account without their password", async () => {
    const { service, tx } = await setup({ passwordHash: await bcrypt.hash('the-real-password', 4) });
    await expect(service.createShop(dto({ password: 'a-guess-123' }))).rejects.toThrow(BadRequestException);
    expect(tx.shop.create).not.toHaveBeenCalled();
    expect(tx.userShop.create).not.toHaveBeenCalled();
  });

  it('lets the real owner add a second shop with their password', async () => {
    const { service, tx } = await setup({ passwordHash: await bcrypt.hash('the-real-password', 4) });
    await service.createShop(dto({ password: 'the-real-password' }));
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.userShop.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u-old', role: 'OWNER' }) });
  });

  it('creates the account for a new email, stores it lowercase, and dates the trial', async () => {
    const { service, tx } = await setup(null);
    await service.createShop(dto());
    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: 'new@owner.test' }) });
    const trialEndsAt: Date = tx.shop.create.mock.calls[0][0].data.trialEndsAt;
    const days = (trialEndsAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(9.9);
    expect(days).toBeLessThan(10.1);
  });
});
