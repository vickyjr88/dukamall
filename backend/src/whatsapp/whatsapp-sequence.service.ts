import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SEQUENCE, SEQUENCE_DELAYS_HOURS } from './whatsapp-kinds';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import { WhatsappOutreachService } from './whatsapp-outreach.service';
import { inSendWindow, startOfNairobiDay } from './whatsapp-subscription';

const TICK_MS = 10 * 60_000;
const HOUR_MS = 3_600_000;
/** A message claimed but not finished (a crash) is tried again after this long. */
const LEASE_MS = 30 * 60_000;
const MAX_FAILURES = 5;
const BATCH = 25;

/**
 * Sends the welcome series to people who messaged a shop and have not replied STOP, each at its due time, for every shop that has
 * connected WhatsApp and switched on "Welcome people who message you". It checks every ten minutes, so a restart or a deploy loses
 * nothing. Both backend slots run it; that is safe because a message is claimed in the database before it is sent.
 *
 * Guards, per shop: only 08:00 to 20:00 Nairobi time, never more than the shop's daily cap of template messages (Meta limits an
 * unverified business to about 250 conversations a day), only to someone who was told they would receive updates, and never to anyone
 * who replied STOP. A step the shop has no link or template for is skipped, not retried for ever. One shop failing never stops another.
 */
@Injectable()
export class WhatsappSequenceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WhatsappSequenceService.name);
  private timer?: NodeJS.Timeout;
  private first?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: WhatsappConnectionService,
    private readonly outreach: WhatsappOutreachService,
  ) {}

  onApplicationBootstrap() {
    this.first = setTimeout(() => void this.safeTick(), 120_000);
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
      this.logger.error(`WhatsApp welcome series check failed: ${(error as Error).message}`);
    }
  }

  async tick(now: Date = new Date()): Promise<{ sent: number; failed: number; skipped: number }> {
    const total = { sent: 0, failed: 0, skipped: 0 };
    if (!inSendWindow(now)) return total;
    const shops = await this.prisma.shopIntegration.findMany({ where: { provider: 'WHATSAPP', enabled: true, shop: { status: { not: 'SUSPENDED' } } }, select: { shopId: true } });
    for (const { shopId } of shops) {
      try {
        const r = await this.tickShop(shopId, now);
        total.sent += r.sent; total.failed += r.failed; total.skipped += r.skipped;
      } catch (error) {
        this.logger.error(`WhatsApp welcome series failed for shop ${shopId}: ${(error as Error).message}`);
      }
    }
    if (total.sent || total.failed) this.logger.log(`WhatsApp welcome series: ${total.sent} sent, ${total.failed} failed, ${total.skipped} skipped.`);
    return total;
  }

  async tickShop(shopId: string, now: Date): Promise<{ sent: number; failed: number; skipped: number }> {
    const result = { sent: 0, failed: 0, skipped: 0 };
    const conn = await this.connections.forShop(shopId);
    if (!conn || !conn.settings.autoSubscribe || !inSendWindow(now)) return result;

    const cap = conn.settings.dailySendCap;
    let sentToday = await this.prisma.whatsappOutreach.count({ where: { shopId, status: 'SENT', createdAt: { gte: startOfNairobiDay(now) } } });
    const availability = new Map((await this.outreach.availability(shopId)).kinds.map((k) => [k.kind, k.ready]));

    const due = await this.prisma.whatsappContact.findMany({
      where: { shopId, subscribed: true, noticeSentAt: { not: null }, nextStep: { lt: SEQUENCE.length }, nextStepAt: { lte: now }, failures: { lt: MAX_FAILURES } },
      orderBy: { nextStepAt: 'asc' },
      take: BATCH,
    });

    for (const contact of due) {
      if (sentToday >= cap) {
        this.logger.warn(`Shop ${shopId}: WhatsApp daily cap of ${cap} reached; the rest wait until tomorrow.`);
        break;
      }
      // Take the message before sending it: only one slot gets count 1.
      const claimed = await this.prisma.whatsappContact.updateMany({
        where: { id: contact.id, nextStep: contact.nextStep, nextStepAt: contact.nextStepAt },
        data: { nextStepAt: new Date(now.getTime() + LEASE_MS) },
      });
      if (claimed.count !== 1) continue;

      const advance = (from: number) => {
        const next = from + 1;
        return this.prisma.whatsappContact.update({
          where: { id: contact.id },
          data: { nextStep: next, failures: 0, nextStepAt: next < SEQUENCE.length ? new Date(now.getTime() + SEQUENCE_DELAYS_HOURS[next] * HOUR_MS) : null },
        });
      };

      const kind = SEQUENCE[contact.nextStep];
      // No link or template for this step: move past it rather than failing on it five times and never sending the next one.
      if (!availability.get(kind)) { await advance(contact.nextStep); result.skipped += 1; continue; }

      const outcome = await this.outreach.sendToPhone(shopId, { kind, phone: contact.phone, name: contact.name?.split(/\s+/)[0], contactId: contact.id, triggeredBy: 'whatsapp-subscription' });
      if (outcome.outcome === 'SENT' || outcome.detail === 'Already sent') {
        await advance(contact.nextStep);
        if (outcome.outcome === 'SENT') { result.sent += 1; sentToday += 1; } else result.skipped += 1;
      } else if (outcome.outcome === 'FAILED') {
        const failures = contact.failures + 1;
        // Left to retry after the lease; given up on after MAX_FAILURES so one bad number is not retried for ever.
        await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { failures, ...(failures >= MAX_FAILURES ? { nextStepAt: null } : {}) } });
        result.failed += 1;
        this.logger.warn(`Shop ${shopId}: welcome message ${kind} to ${contact.phone} failed (${failures}/${MAX_FAILURES}): ${outcome.detail}`);
      } else {
        // Skipped for good: they replied STOP, or the number is unusable.
        await this.prisma.whatsappContact.update({ where: { id: contact.id }, data: { nextStepAt: null } });
        result.skipped += 1;
      }
    }
    return result;
  }
}
