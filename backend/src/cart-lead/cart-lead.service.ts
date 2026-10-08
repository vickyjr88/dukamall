import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordCartLeadDto } from './cart-lead.dto';
import { NotificationsService } from '../notifications/notifications.service';

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
    const [leads, total] = await Promise.all([
      this.prisma.cartLead.findMany({
        where: { shopId, ...(status ? { status } : {}) },
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.cartLead.count({ where: { shopId, ...(status ? { status } : {}) } }),
    ]);
    return { leads, total, page: safePage, pageSize: safePageSize, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
  }

  async get(shopId: string, leadId: string) {
    const lead = await this.prisma.cartLead.findFirst({ where: { id: leadId, shopId }, include: { lines: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
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
