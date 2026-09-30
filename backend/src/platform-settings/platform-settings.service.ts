import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformSettingsService {
  constructor(private prisma: PrismaService) {}

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

  async updateSmtpSettings(data: {
    smtpHost?: string; smtpPort?: number; smtpUser?: string; smtpPassword?: string; smtpFrom?: string; smtpSecure?: boolean;
  }) {
    // A blank password means "leave whatever is already set alone" -- same
    // reasoning as ShopService.updateSettings's Paystack fields: the read
    // side never echoes the real value back, so there's nothing for the
    // admin console's form to round-trip except "unchanged."
    const { smtpPassword, ...rest } = data;
    await this.prisma.platformSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...rest, ...(smtpPassword ? { smtpPassword } : {}) },
      update: { ...rest, ...(smtpPassword ? { smtpPassword } : {}) },
    });
    return this.getSmtpSettings();
  }
}
