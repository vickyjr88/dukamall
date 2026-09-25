import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The platform's entire "reporting" surface, per design doc S:2.3 -- a sales
 * tally read straight off Order/OrderLine, no ledger, no separate reporting
 * schema. Stock is even simpler: ProductVariant.stockOnHand is already the
 * answer, nothing to query here beyond a listing.
 */
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async salesSummary(shopId: string, from?: Date, to?: Date) {
    const where = {
      shopId,
      status: 'PAID' as const,
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
    };

    const [orders, lineAgg] = await Promise.all([
      this.prisma.order.findMany({ where, select: { totalKes: true } }),
      this.prisma.orderLine.groupBy({
        by: ['variantId'],
        where: { order: where },
        _sum: { quantity: true, priceKes: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
    ]);

    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalKes), 0);
    const variantIds = lineAgg.map((l) => l.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    return {
      orderCount: orders.length,
      totalRevenueKes: totalRevenue,
      topProducts: lineAgg.map((line) => {
        const variant = variants.find((v) => v.id === line.variantId);
        return {
          productName: variant?.product.name ?? 'Unknown',
          variantName: variant?.name ?? '',
          quantitySold: line._sum.quantity ?? 0,
          revenueKes: Number(line._sum.priceKes ?? 0),
        };
      }),
    };
  }

  stockLevels(shopId: string) {
    return this.prisma.productVariant.findMany({
      where: { product: { shopId }, isActive: true },
      select: { id: true, sku: true, name: true, stockOnHand: true, product: { select: { name: true } } },
      orderBy: { stockOnHand: 'asc' },
    });
  }
}
