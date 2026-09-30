import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { ShopRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { staffInviteEmail } from '../email/email-templates';
import { storefrontOriginForShop } from '../common/storefront-origin';

/**
 * A merchant's own staff management -- the same invite/remove behaviour
 * AdminService already offers cross-shop from the operator console, but
 * scoped to the caller's own shop so an owner isn't dependent on platform
 * support to add a cashier. Deliberately NOT a shared service with
 * AdminService: that one takes an adminId for audit logging and trusts the
 * caller unconditionally (a platform admin can act on any shop); this one
 * takes the caller's own membership and enforces OWNER-only, which
 * AdminService has no reason to check.
 */
@Injectable()
export class PortalStaffService {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  list(shopId: string) {
    return this.prisma.userShop.findMany({
      where: { shopId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(shopId: string, callerRole: string, data: { email: string; firstName: string; lastName: string; role: ShopRole }) {
    if (callerRole !== 'OWNER') {
      throw new ForbiddenException('Only an owner can add staff');
    }

    let user = await this.prisma.user.findUnique({ where: { email: data.email } });
    let temporaryPassword: string | undefined;

    if (user) {
      const existingMembership = await this.prisma.userShop.findUnique({
        where: { userId_shopId: { userId: user.id, shopId } },
      });
      if (existingMembership) throw new BadRequestException('This person already has access to this shop');
    } else {
      // Shown once in the response, never logged or stored in plaintext --
      // same pattern as AdminService.inviteStaff.
      temporaryPassword = randomBytes(9).toString('base64').replace(/[+/=]/g, '');
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      user = await this.prisma.user.create({
        data: { email: data.email, passwordHash, firstName: data.firstName, lastName: data.lastName },
      });
    }

    await this.prisma.userShop.create({ data: { userId: user.id, shopId, role: data.role } });

    if (temporaryPassword) {
      const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
      const { subject, html } = staffInviteEmail({
        shopName: shop.name,
        firstName: data.firstName,
        email: data.email,
        temporaryPassword,
        portalUrl: `${storefrontOriginForShop(shop)}/portal/login`,
      });
      await this.email.send(data.email, subject, html);
    }

    return {
      userId: user.id,
      email: user.email,
      role: data.role,
      ...(temporaryPassword ? { temporaryPassword } : {}),
    };
  }

  async remove(shopId: string, callerRole: string, callerUserId: string, targetUserId: string) {
    if (callerRole !== 'OWNER') {
      throw new ForbiddenException('Only an owner can remove staff');
    }
    if (targetUserId === callerUserId) {
      throw new BadRequestException('You cannot remove your own access -- ask another owner to do this');
    }

    const membership = await this.prisma.userShop.findUnique({ where: { userId_shopId: { userId: targetUserId, shopId } } });
    if (!membership) throw new NotFoundException('This person does not have access to this shop');

    if (membership.role === 'OWNER') {
      const ownerCount = await this.prisma.userShop.count({ where: { shopId, role: 'OWNER' } });
      if (ownerCount <= 1) throw new BadRequestException('Cannot remove the only owner of a shop');
    }

    await this.prisma.userShop.delete({ where: { userId_shopId: { userId: targetUserId, shopId } } });
    return { success: true };
  }
}
