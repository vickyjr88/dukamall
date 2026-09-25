import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type StaffJwtPayload = { kind?: 'customer'; sub: string; email: string; shopId: string; role: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret-change-me',
    });
  }

  async validate(payload: StaffJwtPayload) {
    // Customer-portal tokens are signed with the same secret -- reject them
    // explicitly here rather than relying on the UserShop lookup missing.
    if (payload?.kind === 'customer') {
      throw new UnauthorizedException();
    }
    const membership = await this.prisma.userShop.findUnique({
      where: { userId_shopId: { userId: payload.sub, shopId: payload.shopId } },
      include: { user: true },
    });
    if (!membership) {
      throw new UnauthorizedException();
    }
    return {
      id: membership.user.id,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      shopId: membership.shopId,
      role: membership.role,
    };
  }
}
