import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PasswordResetAccountKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { passwordResetEmail } from '../email/email-templates';
import { storefrontOriginForShop } from '../common/storefront-origin';
import { findUserByEmail } from '../common/user-email';

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
   * The origin the emailed reset link points at -- decided HERE, never taken
   * from the request. This used to be the caller's own `originBaseUrl`, which
   * meant anyone could ask for a reset of someone else's account with
   * originBaseUrl=https://evil.example and have the platform email the victim
   * a genuine reset link, live token included, pointing at the attacker's
   * site. The portal and admin pages are served on every platform host (they
   * skip shop resolution), so one of the account's own shops' addresses works;
   * a platform admin with no shop uses the platform domain.
   */
  private async staffOriginFor(userId: string): Promise<string> {
    const membership = await this.prisma.userShop.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { shop: true },
    });
    if (membership) return storefrontOriginForShop(membership.shop);
    const domain = process.env.PLATFORM_DOMAIN || 'dukamall.app';
    const isLocal = /(^|\.)localhost(:\d+)?$/.test(domain);
    return `${isLocal ? 'http' : 'https'}://${domain}`;
  }

  /**
   * Staff/admin reset: User.email is globally unique, so no shop context is
   * needed to find the account.
   */
  async requestStaffReset(email: string) {
    const user = await findUserByEmail(this.prisma, email);
    // Always returns the same success shape whether or not the email
    // matched -- a different response here would let anyone enumerate
    // which email addresses have an account on the platform.
    if (!user) return { success: true };
    await this.sendStaffResetLink(user);
    return { success: true };
  }

  /**
   * Creates a reset token for a staff/admin account and emails the link. Used by
   * the public "forgot password" form (which hides the outcome) and by an
   * operator helping a merchant (which reports it). The link is only ever emailed
   * to the account's own address -- the operator never sees it, so a support
   * action can't be used to take over an account.
   */
  async sendStaffResetLink(user: { id: string; email: string }): Promise<'sent' | 'rate_limited' | 'email_failed'> {
    if (await this.resetQuotaExceeded(PasswordResetAccountKind.STAFF, user.id)) return 'rate_limited';

    const token = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        accountKind: PasswordResetAccountKind.STAFF,
        accountId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${await this.staffOriginFor(user.id)}/portal/reset-password?token=${token}`;
    const { subject, html } = passwordResetEmail({ shopName: 'Shops Platform', resetUrl });
    const sent = await this.email.send(user.email, subject, html, undefined, { kind: 'reset' });
    return sent ? 'sent' : 'email_failed';
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
    await this.email.send(customer.email!, subject, html, undefined, { kind: 'reset', shopId });
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
