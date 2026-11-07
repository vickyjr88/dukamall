import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordCartLeadDto } from './cart-lead.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { buildFollowUp, FollowUp, productPath } from '../common/follow-up';
import { storefrontOriginForShop } from '../common/storefront-origin';

/** Each line's product, so a follow-up message can link to it. */
const LEAD_LINES = { include: { lines: { include: { variant: { select: { product: { select: { slug: true } } } } } } } } as const;

type LeadForFollowUp = {
  source: string; status: string; customerName: string | null; customerPhone: string | null;
  lines: Array<{ name: string; size: string; quantity: number; priceKes: unknown; variant?: { product: { slug: string } } | null }>;
};

/**
 * The WhatsApp follow-up for a lead that is still open: what they left or asked about, with a link to each product.
 * Null for a lead already turned into an order or marked lost, and for one with no phone number to message.
 */
export function leadFollowUp(lead: LeadForFollowUp, shop: { name: string; currency: string }, origin: string): FollowUp | null {
  if (lead.status !== 'NEW' && lead.status !== 'CONTACTED') return null;
  const lines = lead.lines.map((l) => ({ name: l.name, label: l.size, quantity: l.quantity, unitPrice: Number(l.priceKes), path: l.variant ? productPath(l.variant.product) : null }));
  return buildFollowUp({
    kind: lead.source === 'WHATSAPP_ORDER' ? 'WHATSAPP_ORDER' : 'ABANDONED_CART',
    shopName: shop.name, currency: shop.currency, name: lead.customerName, phone: lead.customerPhone,
    lines, total: lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0), origin,
  });
}

@Injectable()
export class CartLeadService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // A merchant's own view of leads the storefront already captured (a
  // WhatsApp-order click, or a cart abandoned mid-checkout) -- these sat in
  // the database with only the admin console's cross-shop view able to see
  // them. This is the actual "who almost bought and didn't" follow-up list
  // a shop owner would use to call or WhatsApp someone back.
  async list(shopId: string, page = 1, pageSize = 25, status?: LeadStatus) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    const origin = storefrontOriginForShop(shop);
    const [rows, total] = await Promise.all([
      this.prisma.cartLead.findMany({
        where: { shopId, ...(status ? { status } : {}) },
        ...LEAD_LINES,
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.cartLead.count({ where: { shopId, ...(status ? { status } : {}) } }),
    ]);
    const leads = rows.map((lead) => ({ ...lead, followUp: leadFollowUp(lead, shop, origin) }));
    return { leads, total, page: safePage, pageSize: safePageSize, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
  }

  async get(shopId: string, leadId: string) {
    const lead = await this.prisma.cartLead.findFirst({ where: { id: leadId, shopId }, ...LEAD_LINES });
    if (!lead) throw new NotFoundException('Lead not found');
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    return { ...lead, followUp: leadFollowUp(lead, shop, storefrontOriginForShop(shop)) };
  }

  async record(shopId: string, dto: RecordCartLeadDto) {
    const lead = await this.prisma.cartLead.create({
      data: {
        shopId,
        source: dto.source,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        shippingAddress: dto.shippingAddress,
        message: dto.message,
        sessionId: dto.sessionId,
        lines: {
          create: dto.lines.map((line) => ({
            variantId: line.variantId,
            name: line.name,
            size: line.size,
            quantity: line.quantity,
            priceKes: line.priceKes,
            isCustomSize: line.isCustomSize ?? false,
          })),
        },
      },
      include: { lines: true },
    });
    // Best-effort and not awaited: capturing the lead must never wait on, or
    // fail because of, an email. Only WhatsApp orders alert (see
    // NotificationsService.newLead).
    void this.notifications.newLead(lead.id);
    return lead;
  }

  /**
   * The merchant's own follow-up marker. CONVERTED is not settable here -- it
   * is only ever set by creating an order from the lead (which also records
   * which order) -- and a converted lead is final.
   */
  async setStatus(shopId: string, leadId: string, status: LeadStatus) {
    const lead = await this.prisma.cartLead.findFirst({ where: { id: leadId, shopId } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.status === 'CONVERTED') throw new BadRequestException('An order was created from this lead, so its status is fixed.');
    return this.prisma.cartLead.update({ where: { id: leadId }, data: { status } });
  }
}
