import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopDto } from './onboarding.dto';

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

      let user = await tx.user.findUnique({ where: { email: dto.ownerEmail } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email: dto.ownerEmail,
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
