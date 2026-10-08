import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { newLeadAlertEmail, newOrderAlertEmail } from '../email/email-templates';
import { storefrontOriginForShop } from '../common/storefront-origin';

/**
 * Tells the merchant something needs their attention. Until this existed the
 * only emails the platform sent went to customers and new staff, so a shop
 * owner learned about an order by opening the portal.
 *
 * Best-effort throughout, like every email here: a failure is logged and
 * swallowed, never allowed to fail the checkout or lead capture that
 * triggered it.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService, private email: EmailService) {}

  /** The shop's chosen alert address, or every owner's email when none is set. */
  private async recipients(shopId: string, notificationEmail: string | null): Promise<string[]> {
    if (notificationEmail) return [notificationEmail];
    const owners = await this.prisma.userShop.findMany({
      where: { shopId, role: 'OWNER' },
      select: { user: { select: { email: true } } },
    });
    return owners.map((o) => o.user.email);
  }

  async newOrder(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { shop: true, lines: { select: { quantity: true } } },
      });
      if (!order) return;
      const to = await this.recipients(order.shopId, order.shop.notificationEmail);
      if (to.length === 0) return;

      const { subject, html } = newOrderAlertEmail({
        shopName: order.shop.name,
        orderNumber: order.orderNumber,
        customerName: `${order.firstName} ${order.lastName}`.trim(),
        phone: order.phone,
        currency: order.shop.currency,
        totalKes: Number(order.totalKes),
        itemCount: order.lines.reduce((n, l) => n + l.quantity, 0),
        paid: order.status === 'PAID',
        portalUrl: `${storefrontOriginForShop(order.shop)}/portal/orders/${order.id}`,
      });
      await Promise.all(to.map((address) => this.email.send(address, subject, html, undefined, { kind: 'alert', shopId: order.shopId })));
    } catch (err) {
      this.logger.warn(`New-order alert failed for ${orderId}: ${(err as Error).message}`);
    }
  }

  async newLead(leadId: string): Promise<void> {
    try {
      const lead = await this.prisma.cartLead.findUnique({
        where: { id: leadId },
        include: { shop: true, lines: true },
      });
      // Only a WhatsApp order is worth an alert -- an abandoned cart is
      // frequent and low-intent, and would drown the ones that matter.
      if (!lead || lead.source !== 'WHATSAPP_ORDER') return;
      const to = await this.recipients(lead.shopId, lead.shop.notificationEmail);
      if (to.length === 0) return;

      const { subject, html } = newLeadAlertEmail({
        shopName: lead.shop.name,
        customerName: lead.customerName,
        phone: lead.customerPhone,
        items: lead.lines.map((l) => `${l.quantity} x ${l.name} (${l.size})`),
        portalUrl: `${storefrontOriginForShop(lead.shop)}/portal/leads`,
      });
      await Promise.all(to.map((address) => this.email.send(address, subject, html, undefined, { kind: 'alert', shopId: lead.shopId })));
    } catch (err) {
      this.logger.warn(`New-lead alert failed for ${leadId}: ${(err as Error).message}`);
    }
  }
}
