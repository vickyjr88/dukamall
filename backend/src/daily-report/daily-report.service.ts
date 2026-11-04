import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from './whatsapp.service';
import { classifyStock, compare, label, OrderFact, soldVariants, splitBy, summariseDay, topSellers } from './daily-report.metrics';
import { renderEmail, whatsappParams } from './daily-report.render';
import { shiftDateKey, windowForDate, yesterdayKey } from './daily-report.window';
import type { ActionOrder, DailyReport } from './daily-report.types';

const MAX_ORDER_ROWS = 15;
const HOUR_MS = 3_600_000;
/** A send "pending" for this long was abandoned by a crashed process and may be claimed again. */
const STALE_CLAIM_MS = 10 * 60_000;
/** After this many failed attempts for one recipient and day, stop trying; the log shows why. */
export const MAX_ATTEMPTS = 5;

export type ReportSettings = { enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[] };

export type DeliveryResult = {
  shop: string;
  dateKey: string;
  skipped?: string;
  email: { recipient: string; status: string; error?: string }[];
  whatsapp: { recipient: string; status: string; error?: string }[];
};

const num = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

/** The shops that get the scheduled report, from DAILY_REPORT_SHOPS (comma-separated slugs). */
export const reportShopSlugs = () =>
  (process.env.DAILY_REPORT_SHOPS ?? 'nairobigents').split(',').map((s) => s.trim()).filter(Boolean);

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // --- settings ---------------------------------------------------------------

  /** With nothing saved, the report goes to the shop's notification address, else to its owners. */
  private async defaultRecipients(shopId: string): Promise<string[]> {
    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { notificationEmail: true, staff: { where: { role: 'OWNER' }, select: { user: { select: { email: true } } } } },
    });
    if (shop.notificationEmail) return [shop.notificationEmail];
    return shop.staff.map((s) => s.user.email);
  }

  async getSettings(shopId: string) {
    const [row, shop] = await Promise.all([
      this.prisma.dailyReportSetting.findUnique({ where: { shopId } }),
      this.prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { slug: true } }),
    ]);
    return {
      enabled: row?.enabled ?? true,
      emailRecipients: row ? row.emailRecipients : await this.defaultRecipients(shopId),
      whatsappRecipients: row ? row.whatsappRecipients : [],
      isCustomised: Boolean(row),
      /** False means this shop is not in DAILY_REPORT_SHOPS, so nothing is sent on a schedule (the manual send works). */
      scheduled: reportShopSlugs().includes(shop.slug),
      whatsappConfigured: this.whatsapp.isConfigured,
      whatsappTemplate: this.whatsapp.templateName,
    };
  }

  async updateSettings(shopId: string, patch: Partial<ReportSettings>, updatedBy: string) {
    const current = await this.getSettings(shopId);
    const next = {
      enabled: patch.enabled ?? current.enabled,
      emailRecipients: patch.emailRecipients ?? current.emailRecipients,
      whatsappRecipients: patch.whatsappRecipients ?? current.whatsappRecipients,
      updatedBy,
    };
    await this.prisma.dailyReportSetting.upsert({ where: { shopId }, create: { shopId, ...next }, update: next });
    return this.getSettings(shopId);
  }

  // --- building the report ----------------------------------------------------

  private async facts(shopId: string, where: Prisma.OrderWhereInput) {
    const rows = await this.prisma.order.findMany({
      where: { shopId, ...where },
      orderBy: { createdAt: 'asc' },
      select: {
        orderNumber: true,
        status: true,
        totalKes: true,
        discountKes: true,
        paymentMethod: true,
        paystackReference: true,
        source: true,
        firstName: true,
        lastName: true,
        lines: { select: { quantity: true, priceKes: true, variantId: true, variant: { select: { sku: true, product: { select: { name: true } } } } } },
      },
    });
    const facts: OrderFact[] = rows.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      total: num(o.totalKes),
      discount: num(o.discountKes),
      // An online order that predates paymentMethod has a Paystack reference and no method: that is Paystack.
      method: label(o.paymentMethod ?? (o.paystackReference ? 'PAYSTACK' : null), 'Not paid'),
      source: label(o.source),
      lines: o.lines.map((l) => ({
        variantId: l.variantId,
        sku: l.variant.sku,
        productName: l.variant.product.name,
        quantity: l.quantity,
        lineTotal: num(l.priceKes) * l.quantity,
      })),
    }));
    return { rows, facts };
  }

  /** Orders paid in the window. `paidAt` can be null on older online orders, so those count on the day they were placed. */
  private paidIn(start: Date, end: Date): Prisma.OrderWhereInput {
    return { status: 'PAID', OR: [{ paidAt: { gte: start, lt: end } }, { paidAt: null, createdAt: { gte: start, lt: end } }] };
  }

  private async day(shopId: string, dateKey: string) {
    const w = windowForDate(dateKey);
    const [placed, paid] = await Promise.all([
      this.facts(shopId, { createdAt: { gte: w.start, lt: w.end } }),
      this.facts(shopId, this.paidIn(w.start, w.end)),
    ]);
    return { placed, paid, summary: summariseDay(placed.facts, paid.facts) };
  }

  private async actionOrders(where: Prisma.OrderWhereInput, now: Date): Promise<{ count: number; value: number; oldest: ActionOrder[] }> {
    const [count, sum, oldest] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({ _sum: { totalKes: true }, where }),
      this.prisma.order.findMany({ where, orderBy: { createdAt: 'asc' }, take: 3, select: { orderNumber: true, firstName: true, lastName: true, totalKes: true, createdAt: true, paidAt: true } }),
    ]);
    return {
      count,
      value: num(sum._sum.totalKes),
      oldest: oldest.map((o) => ({
        orderNumber: o.orderNumber,
        customer: [o.firstName, o.lastName].filter(Boolean).join(' ') || 'Customer',
        total: num(o.totalKes),
        ageHours: (now.getTime() - (o.paidAt ?? o.createdAt).getTime()) / HOUR_MS,
      })),
    };
  }

  async build(shopId: string, dateKey: string, now = new Date()): Promise<DailyReport> {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true, currency: true } });
    const w = windowForDate(dateKey);
    const [day, previous, lastWeek] = await Promise.all([
      this.day(shopId, dateKey),
      this.day(shopId, shiftDateKey(dateKey, -1)),
      this.day(shopId, shiftDateKey(dateKey, -7)),
    ]);

    const unpaidCutoff = new Date(now.getTime() - 24 * HOUR_MS);
    const unpaidFloor = new Date(now.getTime() - 14 * 24 * HOUR_MS);
    const [awaitingShipment, unpaid] = await Promise.all([
      this.actionOrders({ shopId, status: 'PAID', fulfilmentStatus: 'UNFULFILLED' }, now),
      this.actionOrders({ shopId, status: 'PENDING', createdAt: { lt: unpaidCutoff, gte: unpaidFloor } }, now),
    ]);

    const sold = soldVariants(day.paid.facts);
    const variants = sold.length
      ? await this.prisma.productVariant.findMany({ where: { id: { in: sold.map((s) => s.variantId) } }, select: { id: true, stockOnHand: true } })
      : [];
    const onHand = new Map(variants.map((v) => [v.id, v.stockOnHand]));

    const [carts, whatsappOrderLeads, newCustomers] = await Promise.all([
      this.prisma.cartLead.findMany({
        where: { shopId, source: 'ABANDONED_CART', status: { not: 'CONVERTED' }, createdAt: { gte: w.start, lt: w.end } },
        select: { lines: { select: { quantity: true, priceKes: true } } },
      }),
      this.prisma.cartLead.count({ where: { shopId, source: 'WHATSAPP_ORDER', createdAt: { gte: w.start, lt: w.end } } }),
      this.prisma.customer.count({ where: { shopId, createdAt: { gte: w.start, lt: w.end } } }),
    ]);

    const products = await this.prisma.product.findMany({
      where: { shopId, isActive: true },
      select: { imageUrls: true, syncSourceId: true, variants: { where: { isActive: true }, select: { stockOnHand: true } } },
    });
    const hasPhoto = (p: (typeof products)[number]) => Array.isArray(p.imageUrls) && p.imageUrls.some((u) => typeof u === 'string' && u.trim() !== '');
    const noStock = (p: (typeof products)[number]) => p.variants.every((v) => v.stockOnHand <= 0);

    return {
      shopName: shop.name,
      currency: shop.currency,
      dateKey,
      label: w.label,
      generatedAt: now.toISOString(),
      today: day.summary,
      vsPreviousDay: compare('day before', day.summary, previous.summary),
      vsLastWeek: compare('same day last week', day.summary, lastWeek.summary),
      orders: day.placed.rows.slice(0, MAX_ORDER_ROWS).map((o, i) => ({
        orderNumber: o.orderNumber,
        customer: [o.firstName, o.lastName].filter(Boolean).join(' ') || 'Customer',
        status: o.status,
        method: day.placed.facts[i].method,
        source: day.placed.facts[i].source,
        total: num(o.totalKes),
      })),
      ordersOmitted: Math.max(0, day.placed.rows.length - MAX_ORDER_ROWS),
      needsAction: { awaitingShipment: { count: awaitingShipment.count, oldest: awaitingShipment.oldest }, unpaidOver24h: { count: unpaid.count, value: unpaid.value, oldest: unpaid.oldest } },
      topSellers: topSellers(day.paid.facts, 5),
      stock: classifyStock(sold, onHand),
      demand: {
        abandonedCarts: carts.length,
        abandonedValue: carts.reduce((s, c) => s + c.lines.reduce((n, l) => n + num(l.priceKes) * l.quantity, 0), 0),
        whatsappOrderLeads,
        newCustomers,
      },
      bySource: splitBy(day.paid.facts, 'source'),
      byPayment: splitBy(day.paid.facts, 'method'),
      catalogue: {
        activeProducts: products.length,
        missingPhoto: products.filter((p) => !hasPhoto(p)).length,
        feedItems: products.filter(hasPhoto).reduce((s, p) => s + p.variants.length, 0),
        noStockAnywhere: products.filter(noStock).length,
        syncedAwaitingStock: products.filter((p) => p.syncSourceId && noStock(p)).length,
      },
    };
  }

  async preview(shopId: string, dateKey?: string) {
    const report = await this.build(shopId, dateKey ?? yesterdayKey(new Date()));
    return { report, email: renderEmail(report), whatsappParameters: whatsappParams(report) };
  }

  // --- delivery -----------------------------------------------------------------

  /** True when this caller may send. False means it was already sent, is being sent right now, or was given up on. */
  private async claim(shopId: string, reportDate: string, channel: string, recipient: string, force: boolean): Promise<boolean> {
    const key = { shopId, reportDate, channel, recipient };
    try {
      await this.prisma.dailyReportRun.create({ data: { ...key, status: 'PENDING', attempts: 1 } });
      return true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
    const reclaimable: Prisma.DailyReportRunWhereInput[] = [
      { status: 'FAILED', attempts: { lt: MAX_ATTEMPTS } },
      { status: 'SKIPPED' },
      { status: 'PENDING', updatedAt: { lt: staleBefore } },
    ];
    if (force) reclaimable.push({ status: { in: ['SENT', 'FAILED'] } });
    const taken = await this.prisma.dailyReportRun.updateMany({ where: { ...key, OR: reclaimable }, data: { status: 'PENDING', error: null, attempts: { increment: 1 } } });
    return taken.count === 1;
  }

  private async skippedStatus(shopId: string, reportDate: string, channel: string, recipient: string) {
    const row = await this.prisma.dailyReportRun.findUnique({ where: { shopId_reportDate_channel_recipient: { shopId, reportDate, channel, recipient } } });
    return row?.status === 'FAILED' ? 'GAVE_UP' : 'ALREADY_SENT';
  }

  private finish(shopId: string, reportDate: string, channel: string, recipient: string, status: 'SENT' | 'FAILED' | 'SKIPPED', error?: string) {
    return this.prisma.dailyReportRun.update({
      where: { shopId_reportDate_channel_recipient: { shopId, reportDate, channel, recipient } },
      data: { status, error: error ?? null },
    });
  }

  /** Builds the report and sends it to everyone in the settings. Safe to call repeatedly: nobody gets it twice. */
  async deliver(shopId: string, dateKey: string = yesterdayKey(new Date()), opts: { force?: boolean } = {}): Promise<DeliveryResult> {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { slug: true, name: true } });
    const result: DeliveryResult = { shop: shop.slug, dateKey, email: [], whatsapp: [] };
    const settings = await this.getSettings(shopId);
    if (!settings.enabled && !opts.force) {
      result.skipped = 'The daily report is switched off in settings.';
      return result;
    }
    if (!settings.emailRecipients.length && !settings.whatsappRecipients.length) {
      result.skipped = 'No recipients: set emailRecipients (or a shop notification email).';
      this.logger.warn(`${shop.slug}: daily report has nobody to send to.`);
      return result;
    }

    const report = await this.build(shopId, dateKey);
    const message = renderEmail(report);
    const force = Boolean(opts.force);

    for (const recipient of settings.emailRecipients) {
      if (!(await this.claim(shopId, dateKey, 'EMAIL', recipient, force))) {
        result.email.push({ recipient, status: await this.skippedStatus(shopId, dateKey, 'EMAIL', recipient) });
        continue;
      }
      const sent = await this.email.sendDetailed(recipient, message.subject, message.html, undefined, { kind: 'daily_report', shopId });
      await this.finish(shopId, dateKey, 'EMAIL', recipient, sent.ok ? 'SENT' : 'FAILED', sent.error);
      result.email.push({ recipient, status: sent.ok ? 'SENT' : 'FAILED', error: sent.error });
    }

    const parameters = whatsappParams(report);
    for (const recipient of settings.whatsappRecipients) {
      if (!(await this.claim(shopId, dateKey, 'WHATSAPP', recipient, force))) {
        result.whatsapp.push({ recipient, status: await this.skippedStatus(shopId, dateKey, 'WHATSAPP', recipient) });
        continue;
      }
      if (!this.whatsapp.isConfigured) {
        const why = 'WhatsApp is not set up on the server (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN).';
        await this.finish(shopId, dateKey, 'WHATSAPP', recipient, 'SKIPPED', why);
        result.whatsapp.push({ recipient, status: 'SKIPPED', error: why });
        continue;
      }
      const sent = await this.whatsapp.sendTemplate(recipient, parameters);
      await this.finish(shopId, dateKey, 'WHATSAPP', recipient, sent.delivered ? 'SENT' : 'FAILED', sent.error);
      result.whatsapp.push({ recipient, status: sent.delivered ? 'SENT' : 'FAILED', error: sent.error });
    }

    for (const f of [...result.email, ...result.whatsapp].filter((r) => r.status === 'FAILED')) {
      this.logger.warn(`${shop.slug}: daily report to ${f.recipient} failed: ${f.error}`);
    }
    return result;
  }

  recentRuns(shopId: string, limit = 30) {
    return this.prisma.dailyReportRun.findMany({ where: { shopId }, orderBy: { updatedAt: 'desc' }, take: limit });
  }
}
