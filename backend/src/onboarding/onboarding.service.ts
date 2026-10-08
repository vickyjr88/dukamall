import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './onboarding.dto';
import { findUserByEmail, normaliseEmail } from '../common/user-email';

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

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          slug: dto.slug,
          name: dto.shopName,
          status: 'TRIAL',
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

      return { shop, ownerUserId: user.id };
    });
  }
}
