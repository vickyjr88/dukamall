import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './onboarding.dto';
import { findUserByEmail, normaliseEmail } from '../common/user-email';
import { cleanSectionKeys, ensureSectionCategories } from '../common/shop-sections';
import { RESERVED_SLUGS } from '../common/reserved-slugs';

/**
 * Self-service shop creation -- design doc Phase 3, but built from day one
 * rather than deferred, since it's also the fastest way to create the first
 * two test shops without hand-writing SQL.
 */
@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

  async createShop(dto: CreateShopDto) {
    const existingShop = await this.prisma.shop.findUnique({ where: { slug: dto.slug } });
    if (existingShop) throw new BadRequestException('That shop URL is already taken');

    // An email that already has an account may only be used to add another shop
    // by someone who knows that account's password. Without this, anyone could
    // create shops owned by another person's account just by typing their email.
    const existingUser = await findUserByEmail(this.prisma, dto.ownerEmail);
    if (existingUser && !(await bcrypt.compare(dto.password, existingUser.passwordHash))) {
      throw new BadRequestException(
        'That email already has an account. Enter its existing password to add another shop, or use a different email.',
      );
    }

    // New shops get a dated trial, so reminders and the (optional) end-of-trial
    // suspension have something to work from.
    const policy = await this.prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
    const trialDays = policy?.trialDays ?? 14;
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          slug: dto.slug,
          name: dto.shopName,
          status: 'TRIAL',
          trialEndsAt,
          sections: cleanSectionKeys(dto.sections),
          theme: { create: {} }, // Platform defaults -- see ShopService.getTheme fallback.
        },
      });

      let user = existingUser;
      if (!user) {
        user = await tx.user.create({
          data: {
            email: normaliseEmail(dto.ownerEmail),
            passwordHash,
            firstName: dto.ownerFirstName,
            lastName: dto.ownerLastName,
          },
        });
      }

      await tx.userShop.create({ data: { userId: user.id, shopId: shop.id, role: 'OWNER' } });

      // What the shop said it sells: its starter categories, so the first product can be filed under the right one.
      for (const key of cleanSectionKeys(dto.sections)) await ensureSectionCategories(tx, shop.id, key);

      return { shop, ownerUserId: user.id };
    });
  }

  /**
   * The operator's version of createShop: no password is typed. A new account gets one nobody knows (the caller emails a reset link so the owner
   * chooses their own); an existing account just gets the new shop. The slug rules are the same as for self-service signup.
   */
  async createShopForOperator(input: { shopName: string; slug: string; ownerEmail: string; ownerFirstName: string; ownerLastName: string; sections?: string[] }) {
    if (!/^[a-z0-9-]{3,40}$/.test(input.slug) || (RESERVED_SLUGS as readonly string[]).includes(input.slug)) {
      throw new BadRequestException('That shop address is not allowed. Use 3 to 40 lowercase letters, numbers and hyphens, and not a reserved word.');
    }
    if (await this.prisma.shop.findUnique({ where: { slug: input.slug } })) throw new BadRequestException('That shop URL is already taken');

    const existingUser = await findUserByEmail(this.prisma, input.ownerEmail);
    const policy = await this.prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
    const trialEndsAt = new Date(Date.now() + (policy?.trialDays ?? 14) * 24 * 60 * 60 * 1000);
    const passwordHash = existingUser ? null : await bcrypt.hash(randomBytes(24).toString('base64url'), 10);

    return this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: { slug: input.slug, name: input.shopName, status: 'TRIAL', trialEndsAt, sections: cleanSectionKeys(input.sections), theme: { create: {} } },
      });
      const user = existingUser ?? await tx.user.create({
        data: { email: normaliseEmail(input.ownerEmail), passwordHash: passwordHash!, firstName: input.ownerFirstName, lastName: input.ownerLastName },
      });
      await tx.userShop.create({ data: { userId: user.id, shopId: shop.id, role: 'OWNER' } });
      for (const key of cleanSectionKeys(input.sections)) await ensureSectionCategories(tx, shop.id, key);
      return { shop, ownerUserId: user.id, createdUser: !existingUser };
    });
  }
}
