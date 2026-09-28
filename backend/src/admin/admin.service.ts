import { Injectable, NotFoundException } from '@nestjs/common';
import { ShopStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async listShops() {
    const shops = await this.prisma.shop.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { products: true, orders: true, customers: true } },
      },
    });
    return shops.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      customDomain: s.customDomain,
      status: s.status,
      currency: s.currency,
      createdAt: s.createdAt,
      productCount: s._count.products,
      orderCount: s._count.orders,
      customerCount: s._count.customers,
    }));
  }

  async getShop(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { theme: true, staff: { include: { user: true } } },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  async setStatus(shopId: string, status: ShopStatus) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    return this.prisma.shop.update({ where: { id: shopId }, data: { status } });
  }

  /** Cross-platform totals for the admin dashboard -- deliberately as shallow as the per-shop sales tally (design doc S:2.3): counts and sums read straight off existing tables, no new reporting schema, no per-shop breakdown beyond what listShops already gives. */
  async platformStats() {
    const [shopCount, activeShopCount, totalOrders, paidOrders, totalCustomers] = await Promise.all([
      this.prisma.shop.count(),
      this.prisma.shop.count({ where: { status: 'ACTIVE' } }),
      this.prisma.order.count(),
      this.prisma.order.findMany({ where: { status: 'PAID' }, select: { totalKes: true } }),
      this.prisma.customer.count(),
    ]);

    return {
      shopCount,
      activeShopCount,
      totalOrders,
      paidOrderCount: paidOrders.length,
      totalRevenueKes: paidOrders.reduce((sum, o) => sum + Number(o.totalKes), 0),
      totalCustomers,
    };
  }
}
