import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Same "invalid credentials" message whether the email doesn't exist,
    // the password is wrong, or the account simply isn't a super-admin --
    // a distinct "you're not an admin" error would let anyone probe which
    // emails have platform-operator access.
    if (!user || !user.isSuperAdmin || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

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
