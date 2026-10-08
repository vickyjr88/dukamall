import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PasswordResetAccountKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { passwordResetEmail } from '../email/email-templates';
import { storefrontOriginForShop } from '../common/storefront-origin';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
// At most this many reset emails per account per hour. The per-IP limit on the
// request routes doesn't stop one victim's inbox being flooded from many
// addresses; this does, and it is silent (same response, no email) so it
// can't be used to probe which accounts exist.
const MAX_RESETS_PER_HOUR = 3;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class PasswordResetService {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  private async resetQuotaExceeded(accountKind: PasswordResetAccountKind, accountId: string): Promise<boolean> {
    const recent = await this.prisma.passwordResetToken.count({
      where: { accountKind, accountId, createdAt: { gt: new Date(Date.now() - TOKEN_TTL_MS) } },
    });
    return recent >= MAX_RESETS_PER_HOUR;
  }

  /**
   * Staff/admin reset: User.email is globally unique, so no shop context is
   * needed to find the account -- a shopSlug isn't collected on this form at
   * all. originBaseUrl comes from the caller's own window.location.origin
   * (the same "the browser tells us where it is" approach
   * AdminService.impersonate's portal/sso link already uses), since a staff
   * member could be resetting from the platform's own domain or a shop's
   * custom domain and the backend has no other way to know which.
   */
  async requestStaffReset(email: string, originBaseUrl: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always returns the same success shape whether or not the email
    // matched -- a different response here would let anyone enumerate
    // which email addresses have an account on the platform.
    if (!user) return { success: true };
    if (await this.resetQuotaExceeded(PasswordResetAccountKind.STAFF, user.id)) return { success: true };

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        accountKind: PasswordResetAccountKind.STAFF,
        accountId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${originBaseUrl}/portal/reset-password?token=${token}`;
    const { subject, html } = passwordResetEmail({ shopName: 'Shops Platform', resetUrl });
    await this.email.send(user.email, subject, html);
    return { success: true };
  }

  /**
   * Customer reset: Customer.email is unique only per shop (the same
   * shopper email can exist at two different shops as two different
   * Customer rows), so shopId is required to find the right one -- and the
   * reset link needs that shop's own storefront origin, not a platform
   * default, since /account/reset-password is served per-tenant.
   */
  async requestCustomerReset(shopId: string, email: string) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const customer = await this.prisma.customer.findUnique({ where: { shopId_email: { shopId, email } } });
    if (!customer) return { success: true };
    if (await this.resetQuotaExceeded(PasswordResetAccountKind.CUSTOMER, customer.id)) return { success: true };

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        accountKind: PasswordResetAccountKind.CUSTOMER,
        accountId: customer.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${storefrontOriginForShop(shop)}/account/reset-password?token=${token}`;
    const { subject, html } = passwordResetEmail({ shopName: shop.name, resetUrl });
    await this.email.send(customer.email!, subject, html);
    return { success: true };
  }

  /**
   * One confirm endpoint for both kinds -- the token itself already encodes
   * which table to write to (via the stored accountKind), so the caller
   * (a portal page or a storefront page) never needs to say which kind of
   * account it's confirming for.
   */
  async confirm(token: string, newPassword: string) {
    const tokenHash = hashToken(token);
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    if (record.accountKind === PasswordResetAccountKind.STAFF) {
      await this.prisma.user.update({ where: { id: record.accountId }, data: { passwordHash } });
    } else {
      await this.prisma.customer.update({ where: { id: record.accountId }, data: { passwordHash } });
    }

    // Marked used rather than deleted -- a used-but-still-present row means
    // a replay attempt (someone reusing an already-spent link) fails with
    // the same "invalid or expired" message as a genuinely expired one,
    // and leaves an audit trail of when a reset actually happened.
    await this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return { success: true };
  }
}
