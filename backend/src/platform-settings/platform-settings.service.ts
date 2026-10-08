import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { encryptSecret } from '../common/secrets';

@Injectable()
export class PlatformSettingsService {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  // Masked the same way ShopService.getPortalSettings masks Paystack keys --
  // an operator needs to know "is SMTP configured," never the password
  // value back.
  async getSmtpSettings() {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
    return {
      smtpHost: row?.smtpHost ?? null,
      smtpPort: row?.smtpPort ?? null,
      smtpUser: row?.smtpUser ?? null,
      smtpFrom: row?.smtpFrom ?? null,
      smtpSecure: row?.smtpSecure ?? false,
      smtpPasswordSet: Boolean(row?.smtpPassword),
    };
  }

  async updateSmtpSettings(adminId: string, data: {
    smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPassword?: string; smtpFrom?: string; smtpSecure?: boolean;
  }) {
    // A blank password means "leave whatever is already set alone" -- same
    // reasoning as ShopService.updateSettings's Paystack fields: the read
    // side never echoes the real value back, so there's nothing for the
    // admin console's form to round-trip except "unchanged."
    const { smtpPassword, ...rest } = data;
    await this.prisma.platformSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...rest, ...(smtpPassword ? { smtpPassword: encryptSecret(smtpPassword) } : {}) },
      update: { ...rest, ...(smtpPassword ? { smtpPassword: encryptSecret(smtpPassword) } : {}) },
    });
    // Who changed the platform's mail setup, and which settings -- the names of
    // the fields only, never their values (the password in particular).
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        shopId: null,
        action: 'platform.smtp_updated',
        metadata: { fields: [...Object.keys(rest).filter((k) => (rest as Record<string, unknown>)[k] !== undefined), ...(smtpPassword ? ['smtpPassword'] : [])] },
      },
    });
    return this.getSmtpSettings();
  }

  /**
   * Sends one real email through the saved settings and reports exactly what
   * happened -- including the mail server's own error -- so an operator can tell
   * a wrong password from a blocked port without reading server logs.
   */
  async sendTestEmail(adminId: string, to: string) {
    const result = await this.email.sendDetailed(
      to,
      'Test email from Shops Platform',
      '<p>This is a test email from the Shops Platform operator console.</p><p>If you can read it, your email settings work.</p>',
      undefined,
      { kind: 'test' },
    );
    await this.prisma.adminAuditLog.create({ data: { adminId, shopId: null, action: 'platform.test_email', metadata: { to, status: result.status } } });
    return result;
  }

  async adminEmail(adminId: string): Promise<string> {
    return (await this.prisma.user.findUniqueOrThrow({ where: { id: adminId }, select: { email: true } })).email;
  }
}
