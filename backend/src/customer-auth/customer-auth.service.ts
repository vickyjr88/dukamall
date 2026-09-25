import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomerAuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  private sign(customerId: string, shopId: string) {
    // kind: 'customer' is what JwtStrategy.validate() checks for and rejects
    // -- this token must never be usable against staff-only routes, even
    // though it's signed with the same secret.
    return this.jwtService.sign({ kind: 'customer', sub: customerId, shopId });
  }

  async register(shopId: string, email: string, password: string, firstName?: string, lastName?: string) {
    const existing = await this.prisma.customer.findUnique({ where: { shopId_email: { shopId, email } } });
    if (existing) {
      throw new BadRequestException('An account with this email already exists');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const customer = await this.prisma.customer.create({
      data: { shopId, email, passwordHash, firstName, lastName },
    });
    return { access_token: this.sign(customer.id, shopId), customer: { id: customer.id, email: customer.email } };
  }

  async login(shopId: string, email: string, password: string) {
    const customer = await this.prisma.customer.findUnique({ where: { shopId_email: { shopId, email } } });
    if (!customer?.passwordHash || !(await bcrypt.compare(password, customer.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { access_token: this.sign(customer.id, shopId), customer: { id: customer.id, email: customer.email } };
  }
}
