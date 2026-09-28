import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async login(dto: LoginDto) {
    const shop = await this.prisma.shop.findUnique({ where: { slug: dto.shopSlug } });
    if (!shop) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const membership = await this.prisma.userShop.findUnique({
      where: { userId_shopId: { userId: user.id, shopId: shop.id } },
    });
    if (!membership) {
      throw new UnauthorizedException('You do not have access to this shop');
    }

    const payload = { sub: user.id, email: user.email, shopId: shop.id, role: membership.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        shopId: shop.id,
        role: membership.role,
      },
    };
  }

  // Requires the current password even though the caller already has a
  // valid JWT -- a stolen/leaked token alone must not be enough to lock the
  // real owner out by changing their password. Same reasoning most account
  // systems use for a password-change form vs. a plain "update profile" one.
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { success: true };
  }
}
