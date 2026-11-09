import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SEQUENCE, SEQUENCE_DELAYS_HOURS } from './whatsapp-kinds';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import {
  ACCOUNT_LEVEL_ERRORS, DeliveryStatus, InboundMessage, classifyKeyword, noticeText, pickDelivery, resubscribedText, stoppedText,
} from './whatsapp-subscription';

const HOUR_MS = 3_600_000;

/**
 * People who message a shop's WhatsApp number (usually from an ad). With "Welcome people who message you" switched on, the first time
 * someone writes they are told they will receive updates and that STOP opts out, then put through the welcome series. STOP removes them
 * at once and for good: nothing the shop sends reaches that number again until they reply START. STOP and START always work, whether or
 * not the welcome series is on.
 *
 * Every method takes the shop: contacts, messages and delivery reports of one shop are never visible to another.
 */
@Injectable()
export class WhatsappContactsService {
  private readonly logger = new Logger(WhatsappContactsService.name);

  constructor(private readonly prisma: PrismaService, private readonly connections: WhatsappConnectionService) {}

  /** Sends the notice once. The claim is atomic, so Meta delivering the same webhook twice (it does) cannot send it twice. */
  private async sendNotice(shopId: string, contactId: string, phone: string) {
    const conn = await this.connections.forShop(shopId);
    if (!conn) return;
    const claimed = await this.prisma.whatsappContact.updateMany({ where: { id: contactId, shopId, noticeSentAt: null }, data: { noticeSentAt: new Date() } });
    if (claimed.count !== 1) return;
    const sent = await conn.client.sendText(phone, noticeText(conn.shopName));
    if (!sent.delivered) {
      // Not told, so not subscribed in practice: the sequence waits for a notice, and the next message they send retries it.
      await this.prisma.whatsappContact.update({ where: { id: contactId }, data: { noticeSentAt: null } });
      this.logger.warn(`Could not send the subscription notice to ${phone}: ${sent.error}`);
    }
  }

  /** What to do with one message someone sent the shop. */
  async handleMessage(shopId: string, message: InboundMessage): Promise<'STOPPED' | 'RESUBSCRIBED' | 'SUBSCRIBED' | 'SEEN' | 'IGNORED'> {
    const phone = message.from;
    const keyword = classifyKeyword(message.text);
    const now = new Date();
    const conn = await this.connections.forShop(shopId);
    const existing = await this.prisma.whatsappContact.findUnique({ where: { shopId_phone: { shopId, phone } } });
    const shopName = conn?.shopName ?? (await this.prisma.shop.findUnique({ where: { id: shopId }, select: { name: true } }))?.name ?? 'the shop';
    const autoSubscribe = conn?.settings.autoSubscribe ?? false;

    if (keyword === 'STOP') {
      await this.prisma.whatsappContact.upsert({
        where: { shopId_phone: { shopId, phone } },
        create: { shopId, phone, name: message.name, subscribed: false, unsubscribedReason: 'STOP', unsubscribedAt: now, nextStepAt: null, lastMessageAt: now },
        update: { subscribed: false, unsubscribedReason: 'STOP', unsubscribedAt: now, nextStepAt: null, lastMessageAt: now },
      });
      if (conn) await conn.client.sendText(phone, stoppedText(shopName));
      return 'STOPPED';
    }

    if (keyword === 'START') {
      if (!autoSubscribe) return 'IGNORED';
      const step = existing?.nextStep ?? 0;
      await this.prisma.whatsappContact.upsert({
        where: { shopId_phone: { shopId, phone } },
        create: { shopId, phone, name: message.name, subscribed: true, nextStepAt: new Date(now.getTime() + SEQUENCE_DELAYS_HOURS[0] * HOUR_MS), lastMessageAt: now },
        update: {
          subscribed: true, unsubscribedReason: null, unsubscribedAt: null, failures: 0, lastMessageAt: now,
          nextStepAt: step < SEQUENCE.length ? new Date(now.getTime() + SEQUENCE_DELAYS_HOURS[Math.min(step, SEQUENCE_DELAYS_HOURS.length - 1)] * HOUR_MS) : null,
        },
      });
      if (conn) await conn.client.sendText(phone, resubscribedText(shopName));
      return 'RESUBSCRIBED';
    }

    if (!existing) {
      if (!autoSubscribe) return 'IGNORED';
      let created;
      try {
        created = await this.prisma.whatsappContact.create({
          data: {
            shopId, phone, name: message.name,
            adSourceId: message.referral?.sourceId, adHeadline: message.referral?.headline, adClickId: message.referral?.clickId,
            nextStepAt: new Date(now.getTime() + SEQUENCE_DELAYS_HOURS[0] * HOUR_MS),
            firstMessageAt: message.timestamp ?? now, lastMessageAt: now,
          },
        });
      } catch (error) {
        // Two deliveries of the same first message at once: the other one made the contact, and it sends the notice.
        if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return 'SEEN';
        throw error;
      }
      await this.sendNotice(shopId, created.id, phone);
      return 'SUBSCRIBED';
    }

    await this.prisma.whatsappContact.update({
      where: { id: existing.id },
      data: {
        lastMessageAt: now,
        ...(existing.name ? {} : { name: message.name }),
        ...(!existing.adSourceId && message.referral ? { adSourceId: message.referral.sourceId, adHeadline: message.referral.headline, adClickId: message.referral.clickId } : {}),
      },
    });
    // A contact whose notice never went out (the send failed) is told on the next message, inside the window it opens.
    if (existing.subscribed && !existing.noticeSentAt && autoSubscribe) await this.sendNotice(shopId, existing.id, phone);
    return 'SEEN';
  }

  /** Records what Meta says happened to a message this shop sent, and keeps the freshest state on the row it belongs to. */
  async recordStatus(shopId: string, status: DeliveryStatus) {
    await this.prisma.whatsappMessageStatus
      .upsert({
        where: { shopId_messageId_status: { shopId, messageId: status.id, status: status.status } },
        create: { shopId, messageId: status.id, recipient: status.recipient, status: status.status, errorCode: status.errorCode, errorTitle: status.errorTitle, occurredAt: status.timestamp ?? new Date() },
        update: {},
      })
      .catch((error) => this.logger.warn(`Could not record status ${status.status} for ${status.id}: ${error.message}`));

    const failure = (next: string) => (next === 'failed' ? [status.errorCode, status.errorTitle].filter(Boolean).join(': ').slice(0, 500) || null : null);

    const report = await this.prisma.dailyReportRun.findFirst({ where: { shopId, messageId: status.id }, select: { id: true, delivery: true } });
    if (report) {
      const next = pickDelivery(report.delivery, status.status);
      await this.prisma.dailyReportRun.update({ where: { id: report.id }, data: { delivery: next, deliveryError: failure(next) } });
    }

    const outreach = await this.prisma.whatsappOutreach.findFirst({ where: { shopId, messageId: status.id }, select: { id: true, delivery: true, contactId: true, kind: true } });
    if (outreach) {
      const next = pickDelivery(outreach.delivery, status.status);
      await this.prisma.whatsappOutreach.update({ where: { id: outreach.id }, data: { delivery: next, deliveryError: failure(next) } });
      if (next === 'failed' && outreach.delivery !== 'failed' && outreach.contactId) await this.reopenStep(shopId, outreach.contactId, outreach.kind, status.errorCode);
    }
  }

  /**
   * The sequence moves on as soon as WhatsApp accepts a message, but acceptance is not arrival: the failure report comes later. When one of
   * the welcome messages is reported failed, the person goes back to that step so they are not left without it. A failure that is the
   * account's fault (payment, a lock) is retried in six hours without counting against them; any other is retried in a day and counts, so
   * a number that is not on WhatsApp is given up on after five.
   */
  async reopenStep(shopId: string, contactId: string, kind: string, errorCode: string | null) {
    const index = SEQUENCE.indexOf(kind as (typeof SEQUENCE)[number]);
    if (index < 0) return;
    const contact = await this.prisma.whatsappContact.findFirst({ where: { id: contactId, shopId } });
    // Only the step they were just moved past: if they have moved further on, that message is not what is owed.
    if (!contact || !contact.subscribed || contact.nextStep !== index + 1) return;
    const accountLevel = Boolean(errorCode && ACCOUNT_LEVEL_ERRORS.has(errorCode));
    const failures = accountLevel ? contact.failures : contact.failures + 1;
    await this.prisma.whatsappContact.update({
      where: { id: contactId },
      data: { nextStep: index, failures, nextStepAt: failures >= 5 ? null : new Date(Date.now() + (accountLevel ? 6 : 24) * HOUR_MS) },
    });
  }

  async stats(shopId: string) {
    const [subscribed, stopped, waiting, finished, conn] = await Promise.all([
      this.prisma.whatsappContact.count({ where: { shopId, subscribed: true } }),
      this.prisma.whatsappContact.count({ where: { shopId, unsubscribedReason: 'STOP' } }),
      this.prisma.whatsappContact.count({ where: { shopId, subscribed: true, nextStep: { lt: SEQUENCE.length } } }),
      this.prisma.whatsappContact.count({ where: { shopId, subscribed: true, nextStep: { gte: SEQUENCE.length } } }),
      this.connections.forShop(shopId),
    ]);
    return { subscribed, stopped, inSequence: waiting, finished, autoSubscribe: conn?.settings.autoSubscribe ?? false };
  }

  async list(shopId: string, query: { page?: number; pageSize?: number; search?: string }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const term = query.search?.trim();
    const where: Prisma.WhatsappContactWhereInput = {
      shopId,
      ...(term ? { OR: [{ phone: { contains: term.replace(/\D/g, '') || term } }, { name: { contains: term, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.whatsappContact.findMany({ where, orderBy: { lastMessageAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.whatsappContact.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** The owner unsubscribing someone who asked another way (a call, a visit). Same effect as the STOP reply, without a message to them. */
  async unsubscribe(shopId: string, id: string) {
    const updated = await this.prisma.whatsappContact.updateMany({
      where: { id, shopId },
      data: { subscribed: false, unsubscribedReason: 'STOP', unsubscribedAt: new Date(), nextStepAt: null },
    });
    if (updated.count !== 1) throw new NotFoundException('That person is not in your list.');
    return this.prisma.whatsappContact.findUniqueOrThrow({ where: { id } });
  }
}
