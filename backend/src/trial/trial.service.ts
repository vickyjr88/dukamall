import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { shopStatusEmail, trialEmail } from '../email/email-templates';
import { storefrontOriginForShop } from '../common/storefront-origin';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export type TrialKind = '7d' | '3d' | '1d' | 'ended';

/** Which reminder applies now: the most urgent one whose time has come. */
export function reminderKindFor(trialEndsAt: Date, now: Date = new Date()): TrialKind | null {
  const left = trialEndsAt.getTime() - now.getTime();
  if (left <= 0) return 'ended';
  if (left <= 1 * DAY_MS) return '1d';
  if (left <= 3 * DAY_MS) return '3d';
  if (left <= 7 * DAY_MS) return '7d';
  return null;
}

export type TrialSweepResult = { reminders: number; suspended: number };

/**
 * Keeps trials honest. Once an hour: email shops as their trial runs out (each
 * notice at most once per end date) and, only if the operator has switched it
 * on, close shops that are a grace period past the end.
 *
 * Both backend slots run this. That's safe because each notice is "claimed" by
 * inserting its TrialReminder row first -- the unique key means only one slot
 * gets to send it -- and suspension only touches shops not already suspended.
 */
@Injectable()
export class TrialService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TrialService.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(private prisma: PrismaService, private email: EmailService) {}

  onApplicationBootstrap() {
    if (process.env.DISABLE_TRIAL_SWEEP === 'true') return;
    // First pass a minute after start (not during boot), then hourly.
    this.first = setTimeout(() => void this.safeSweep(), 60_000);
    this.timer = setInterval(() => void this.safeSweep(), HOUR_MS);
  }

  onApplicationShutdown() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  private async safeSweep() {
    try {
      const r = await this.sweep();
      if (r.reminders || r.suspended) this.logger.log(`Trial sweep: ${r.reminders} reminder(s), ${r.suspended} suspension(s).`);
    } catch (err) {
      this.logger.error(`Trial sweep failed: ${(err as Error).message}`);
    }
  }

  async sweep(now: Date = new Date()): Promise<TrialSweepResult> {
    const policy = await this.prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
    const autoSuspend = policy?.suspendExpiredTrials ?? false;
    const graceDays = policy?.trialGraceDays ?? 7;
    let reminders = 0;
    let suspended = 0;

    const shops = await this.prisma.shop.findMany({
      where: { billingPlan: 'TRIAL', status: { not: 'SUSPENDED' }, trialEndsAt: { not: null } },
      include: { staff: { where: { role: 'OWNER' }, include: { user: { select: { email: true } } } } },
    });

    for (const shop of shops) {
      const endsAt = shop.trialEndsAt!;
      const portalUrl = `${storefrontOriginForShop(shop)}/portal/dashboard`;
      const suspendAt = new Date(endsAt.getTime() + graceDays * DAY_MS);
      const owners = shop.staff.map((s) => s.user.email);

      // Auto-suspend wins over a reminder for a shop already past its grace.
      if (autoSuspend && suspendAt <= now) {
        const r = await this.prisma.shop.updateMany({ where: { id: shop.id, status: { not: 'SUSPENDED' } }, data: { status: 'SUSPENDED' } });
        if (r.count > 0) {
          suspended++;
          await this.prisma.adminAuditLog.create({
            data: { adminId: null, shopId: shop.id, action: 'shop.status_changed', reason: 'Trial ended', metadata: { from: shop.status, to: 'SUSPENDED', automatic: true } },
          });
          const { subject, html } = shopStatusEmail({ shopName: shop.name, suspended: true, portalUrl: `${storefrontOriginForShop(shop)}/portal/login` });
          await Promise.all(owners.map((to) => this.email.send(to, subject, html, undefined, { kind: 'shop_status', shopId: shop.id })));
        }
        continue;
      }

      const kind = reminderKindFor(endsAt, now);
      if (!kind) continue;
      try {
        // Claim it first; a duplicate (another slot, an earlier pass) fails the unique key.
        await this.prisma.trialReminder.create({ data: { shopId: shop.id, kind, trialEndsAt: endsAt } });
      } catch {
        continue;
      }
      reminders++;
      const { subject, html } = trialEmail({
        shopName: shop.name,
        kind,
        endsOn: endsAt.toLocaleDateString('en-GB'),
        portalUrl,
        suspendOn: kind === 'ended' && autoSuspend ? suspendAt.toLocaleDateString('en-GB') : undefined,
      });
      await Promise.all(owners.map((to) => this.email.send(to, subject, html, undefined, { kind: 'trial', shopId: shop.id })));
    }
    return { reminders, suspended };
  }
}
