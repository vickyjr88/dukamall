import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordCartLeadDto } from './cart-lead.dto';

@Injectable()
export class CartLeadService {
  constructor(private prisma: PrismaService) {}

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
