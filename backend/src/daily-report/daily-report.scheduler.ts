import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DailyReportService, reportShopSlugs } from './daily-report.service';
import { EAT_OFFSET_MINUTES, yesterdayKey } from './daily-report.window';

const TICK_MS = 5 * 60_000;

/**
 * Sends each shop's report once its send hour has passed in Nairobi (DAILY_REPORT_HOUR, default 7).
 *
 * It checks every five minutes rather than sleeping until 07:00, which makes a restart or a deploy at the wrong
 * moment harmless: the next check sends whatever is still owed. Both backend slots run this. That is safe because
 * every message is claimed in DailyReportRun first (unique per shop, day, channel and recipient), so only one slot
 * sends it, and a failed send is retried on later checks up to MAX_ATTEMPTS times.
 *
 * DAILY_REPORT_ENABLED=false turns the scheduler off (the manual send in the portal still works).
 */
@Injectable()
export class DailyReportScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DailyReportScheduler.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;
  /** shopId:day pairs finished in this process, so a settled day costs nothing on later checks. */
  private readonly settled = new Set<string>();
  private readonly sendHour = Number(process.env.DAILY_REPORT_HOUR || 7);

  constructor(private readonly prisma: PrismaService, private readonly reports: DailyReportService) {}

  onApplicationBootstrap() {
    if (process.env.DAILY_REPORT_ENABLED === 'false') return;
    this.first = setTimeout(() => void this.safeTick(), 90_000);
    this.timer = setInterval(() => void this.safeTick(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.first) clearTimeout(this.first);
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick() {
    try {
      await this.tick();
    } catch (error) {
      this.logger.error(`Daily report check failed: ${(error as Error).message}`);
    }
  }

  async tick(now: Date = new Date()) {
    const localHour = new Date(now.getTime() + EAT_OFFSET_MINUTES * 60_000).getUTCHours();
    if (localHour < this.sendHour) return;
    const dateKey = yesterdayKey(now);

    const shops = await this.prisma.shop.findMany({ where: { slug: { in: reportShopSlugs() }, status: { not: 'SUSPENDED' } }, select: { id: true, slug: true } });
    for (const shop of shops) {
      const memo = `${shop.id}:${dateKey}`;
      if (this.settled.has(memo)) continue;
      const result = await this.reports.deliver(shop.id, dateKey);
      const outcomes = [...result.email, ...result.whatsapp].map((r) => r.status);
      if (outcomes.includes('SENT')) this.logger.log(`${shop.slug}: daily report for ${dateKey} sent (${outcomes.filter((s) => s === 'SENT').length} message(s)).`);
      // Anything still FAILED is retried next check; everything else is final for the day.
      if (!outcomes.includes('FAILED')) this.settled.add(memo);
    }
  }
}
