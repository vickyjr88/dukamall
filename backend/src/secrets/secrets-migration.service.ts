import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret, isEncrypted, secretsKeyConfigured } from '../common/secrets';

/**
 * On start, encrypts any secret still stored as plaintext. Safe to run on
 * every start and from two backend slots at once: each row is updated only if
 * it still holds the exact plaintext that was read, so a race can't double-encrypt
 * or overwrite a newer value.
 */
@Injectable()
export class SecretsMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SecretsMigrationService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (!secretsKeyConfigured()) return;
    try {
      const done = await this.run();
      if (done > 0) this.logger.log(`Encrypted ${done} stored secret(s).`);
    } catch (err) {
      // Never stop the app from starting over this.
      this.logger.error(`Secret encryption pass failed: ${(err as Error).message}`);
    }
  }

  /** Returns how many values were encrypted. */
  async run(): Promise<number> {
    let count = 0;

    const shops = await this.prisma.shop.findMany({ where: { paystackSecretKey: { not: null } }, select: { id: true, paystackSecretKey: true } });
    for (const s of shops) {
      if (!s.paystackSecretKey || isEncrypted(s.paystackSecretKey)) continue;
      const r = await this.prisma.shop.updateMany({
        where: { id: s.id, paystackSecretKey: s.paystackSecretKey },
        data: { paystackSecretKey: encryptSecret(s.paystackSecretKey) },
      });
      count += r.count;
    }

    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
    if (settings?.smtpPassword && !isEncrypted(settings.smtpPassword)) {
      const r = await this.prisma.platformSettings.updateMany({
        where: { id: 'singleton', smtpPassword: settings.smtpPassword },
        data: { smtpPassword: encryptSecret(settings.smtpPassword) },
      });
      count += r.count;
    }

    const users = await this.prisma.user.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true } });
    for (const u of users) {
      if (!u.totpSecret || isEncrypted(u.totpSecret)) continue;
      const r = await this.prisma.user.updateMany({ where: { id: u.id, totpSecret: u.totpSecret }, data: { totpSecret: encryptSecret(u.totpSecret) } });
      count += r.count;
    }
    return count;
  }
}
