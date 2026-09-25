import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

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
}
