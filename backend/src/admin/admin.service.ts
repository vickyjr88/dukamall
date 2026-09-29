import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, ShopStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

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

  /**
   * Richer than listShops's row -- this backs the shop detail page, so it
   * also carries the order summary (count + paid revenue, same shape as
   * platformStats's own tally) and the shop's own recent admin-audit
   * history, neither of which the list view needs.
   */
  async getShop(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        theme: true,
        // Excludes passwordHash -- pre-existing gap (a bare `include: { user:
        // true }` pulls every column) found while adding this endpoint's
        // richer payload; fixed here since it's the exact query being touched.
        staff: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true, createdAt: true } } } },
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');

    const [orderCount, paidOrders, auditLog] = await Promise.all([
      this.prisma.order.count({ where: { shopId } }),
      this.prisma.order.findMany({ where: { shopId, status: 'PAID' }, select: { totalKes: true } }),
      this.prisma.adminAuditLog.findMany({
        where: { shopId },
        include: { admin: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      ...shop,
      orderSummary: {
        orderCount,
        paidOrderCount: paidOrders.length,
        totalRevenueKes: paidOrders.reduce((sum, o) => sum + Number(o.totalKes), 0),
      },
      auditLog,
    };
  }

  async setStatus(shopId: string, adminId: string, status: ShopStatus, reason?: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    const updated = await this.prisma.shop.update({ where: { id: shopId }, data: { status } });
    await this.logAction(adminId, shopId, 'shop.status_changed', reason, { from: shop.status, to: status });
    return updated;
  }

  /**
   * Signs a normal staff session for whoever owns (or, failing that, staffs)
   * the target shop -- the exact payload shape auth.service.ts's login()
   * produces, so it's accepted by the existing JwtStrategy/ShopScopeGuard
   * unmodified rather than needing a second auth path. Support can then see
   * exactly what that merchant sees without ever touching their password.
   */
  async impersonate(shopId: string, adminId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    const membership = await this.prisma.userShop.findFirst({
      where: { shopId },
      // OWNER first -- an owner's session is the most representative "what
      // this merchant sees" view; any staff row is still usable if a shop
      // somehow has no owner (shouldn't happen via onboarding, but this
      // keeps impersonation from hard-failing on a data oddity).
      orderBy: { role: 'asc' },
      include: { user: true },
    });
    if (!membership) throw new NotFoundException('This shop has no staff to impersonate');

    const payload = { sub: membership.user.id, email: membership.user.email, shopId, role: membership.role };
    await this.logAction(adminId, shopId, 'shop.impersonated', undefined, { asUserId: membership.user.id });

    return { access_token: this.jwtService.sign(payload), shopSlug: shop.slug };
  }

  private async logAction(adminId: string, shopId: string | null, action: string, reason?: string, metadata?: Prisma.InputJsonValue) {
    await this.prisma.adminAuditLog.create({
      data: { adminId, shopId, action, reason, metadata },
    });
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

  /**
   * Paid revenue across every shop, bucketed by day, for the dashboard's
   * trend chart. A raw query grouping by date_trunc is simpler and far
   * cheaper than pulling every paid order into Node to bucket by hand --
   * Postgres is already a hard dependency here (see the pg_trgm migration).
   */
  async revenueTrend(days: number) {
    const clampedDays = Math.min(90, Math.max(1, days));
    const rows = await this.prisma.$queryRaw<{ day: Date; revenue: string; orderCount: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day,
             COALESCE(SUM("totalKes"), 0) AS revenue,
             COUNT(*) AS "orderCount"
      FROM "Order"
      WHERE status = 'PAID' AND "createdAt" >= now() - (${clampedDays}::text || ' days')::interval
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map((r) => ({
      date: r.day.toISOString().slice(0, 10),
      revenueKes: Number(r.revenue),
      orderCount: Number(r.orderCount),
    }));
  }

  /** Most recent WhatsApp/cart-abandonment leads across every shop -- the
   * portal already shows a shop's own leads; nothing rolled them up
   * platform-wide before this, so there was no way to see which shops are
   * getting inquiries at all versus going quiet. */
  async listCartLeads(limit: number) {
    return this.prisma.cartLead.findMany({
      take: Math.min(200, Math.max(1, limit)),
      orderBy: { createdAt: 'desc' },
      include: {
        shop: { select: { id: true, name: true, slug: true } },
        lines: true,
      },
    });
  }
}
