import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordCartLeadDto } from './cart-lead.dto';

@Injectable()
export class CartLeadService {
  constructor(private prisma: PrismaService) {}

  // A merchant's own view of leads the storefront already captured (a
  // WhatsApp-order click, or a cart abandoned mid-checkout) -- these sat in
  // the database with only the admin console's cross-shop view able to see
  // them. This is the actual "who almost bought and didn't" follow-up list
  // a shop owner would use to call or WhatsApp someone back.
  async list(shopId: string, page = 1, pageSize = 25) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const [leads, total] = await Promise.all([
      this.prisma.cartLead.findMany({
        where: { shopId },
        include: { lines: true },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.cartLead.count({ where: { shopId } }),
    ]);
    return { leads, total, page: safePage, pageSize: safePageSize, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
  }

  record(shopId: string, dto: RecordCartLeadDto) {
    return this.prisma.cartLead.create({
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
  }
}
