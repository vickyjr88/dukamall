import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { findUserByEmail } from '../common/user-email';

@Injectable()
export class AdminAuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async login(email: string, password: string) {
    const user = await findUserByEmail(this.prisma, email);
    const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
    // Same "invalid credentials" message whether the email doesn't exist,
    // the password is wrong, or the account simply isn't a super-admin --
    // a distinct "you're not an admin" error would let anyone probe which
    // emails have platform-operator access.
    if (!user || !user.isSuperAdmin || !passwordOk) {
      // A wrong password against a real admin account is worth an operator's
      // attention (someone guessing at it); anything else is just noise and
      // is deliberately not recorded, so the log can't be used to learn which
      // emails are admins or be flooded with junk.
      if (user?.isSuperAdmin) {
        await this.prisma.adminAuditLog.create({ data: { adminId: user.id, shopId: null, action: 'admin.login_failed' } }).catch(() => {});
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.adminAuditLog.create({ data: { adminId: user.id, shopId: null, action: 'admin.login' } });

    // kind: 'admin' -- a third token space alongside staff (no kind) and
    // customer (kind: 'customer'). No shopId claim at all: unlike a staff
    // token, which is scoped to exactly one shop via UserShop, an admin
    // token's whole point is operating across every shop, so there is
    // nothing to scope it to.
    const payload = { kind: 'admin', sub: user.id, email: user.email };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    };
  }
}
