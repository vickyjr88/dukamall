import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { BillingPlan, Prisma, ShopRole, ShopStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainVerificationService } from '../shop/domain-verification.service';
import { EmailService } from '../email/email.service';
import { shopStatusEmail, staffInviteEmail } from '../email/email-templates';
import { storefrontOriginForShop } from '../common/storefront-origin';
import { IMPERSONATION_TTL_SECONDS } from '../common/impersonation';
import { findUserByEmail, normaliseEmail } from '../common/user-email';

const TRIAL_EXPIRING_SOON_DAYS = 7;

function isTrialExpiringSoon(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return false;
  const now = Date.now();
  const msUntil = trialEndsAt.getTime() - now;
  return msUntil > 0 && msUntil <= TRIAL_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
}

export const SHOP_SORTS = ['created', 'name', 'orders', 'revenue', 'lastOrder', 'lastLogin'] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export type AdminShopListQuery = {
  search?: string;
  status?: ShopStatus;
  plan?: BillingPlan;
  /** Whether Paystack is set up. */
  payments?: 'ready' | 'missing';
  trial?: 'expiring' | 'expired';
  /** Shops that are at least this many days old and have had no order in that long. */
  inactiveDays?: number;
  sort?: ShopSort;
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private domainVerification: DomainVerificationService,
    private email: EmailService,
  ) {}

  /**
   * Every shop with the figures an operator triages by -- orders, paid revenue,
   * when it last took an order and when someone last logged in -- so a quiet or
   * stuck shop stands out. The per-shop numbers come from a few grouped queries
   * (one row per shop, however many orders exist) and the shop rows themselves
   * are filtered, sorted and paged in memory, which is fine at the number of
   * shops a platform like this has; revisit if it ever runs to tens of thousands.
   */
  private async shopRows(query: AdminShopListQuery) {
    const where: Prisma.ShopWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.plan ? { billingPlan: query.plan } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { slug: { contains: query.search, mode: 'insensitive' } }] }
        : {}),
    };

    const [shops, orderStats, paidStats, loginStats] = await Promise.all([
      this.prisma.shop.findMany({ where, include: { _count: { select: { products: true, orders: true, customers: true } } } }),
      this.prisma.order.groupBy({ by: ['shopId'], _max: { createdAt: true } }),
      this.prisma.order.groupBy({ by: ['shopId'], where: { status: 'PAID' }, _sum: { totalKes: true } }),
      this.prisma.$queryRaw<{ shopId: string; last: Date | null }[]>`
        SELECT us."shopId", max(u."lastLoginAt") AS last
        FROM "UserShop" us JOIN "User" u ON u.id = us."userId"
        GROUP BY us."shopId"`,
    ]);

    const lastOrder = new Map(orderStats.map((r) => [r.shopId, r._max.createdAt]));
    const revenue = new Map(paidStats.map((r) => [r.shopId, Number(r._sum.totalKes ?? 0)]));
    const lastLogin = new Map(loginStats.map((r) => [r.shopId, r.last]));
    const now = Date.now();

    let rows = shops.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      customDomain: s.customDomain,
      // Where the shop actually lives (its own domain, else <slug>.<platform domain>).
      storefrontUrl: storefrontOriginForShop(s),
      status: s.status,
      currency: s.currency,
      createdAt: s.createdAt,
      productCount: s._count.products,
      orderCount: s._count.orders,
      customerCount: s._count.customers,
      paidRevenue: revenue.get(s.id) ?? 0,
      lastOrderAt: lastOrder.get(s.id) ?? null,
      lastLoginAt: lastLogin.get(s.id) ?? null,
      // Never the actual keys -- listShops doesn't select them at all,
      // only whether both are present.
      paymentReady: Boolean(s.paystackSecretKey && s.paystackPublicKey),
      billingPlan: s.billingPlan,
      trialEndsAt: s.trialEndsAt,
      trialExpiringSoon: isTrialExpiringSoon(s.trialEndsAt),
    }));

    if (query.payments) rows = rows.filter((r) => r.paymentReady === (query.payments === 'ready'));
    if (query.trial === 'expiring') rows = rows.filter((r) => r.trialExpiringSoon);
    if (query.trial === 'expired') rows = rows.filter((r) => r.trialEndsAt && r.trialEndsAt.getTime() < now);
    if (query.inactiveDays && query.inactiveDays > 0) {
      const cutoff = now - query.inactiveDays * DAY_MS;
      rows = rows.filter((r) => r.createdAt.getTime() < cutoff && (!r.lastOrderAt || r.lastOrderAt.getTime() < cutoff));
    }

    // Missing dates sort as "never": last when newest-first, first when oldest-first.
    const time = (d: Date | null) => (d ? d.getTime() : 0);
    const keyOf: Record<ShopSort, (r: (typeof rows)[number]) => number | string> = {
      created: (r) => time(r.createdAt),
      name: (r) => r.name.toLowerCase(),
      orders: (r) => r.orderCount,
      revenue: (r) => r.paidRevenue,
      lastOrder: (r) => time(r.lastOrderAt),
      lastLogin: (r) => time(r.lastLoginAt),
    };
    const sort = query.sort && SHOP_SORTS.includes(query.sort) ? query.sort : 'created';
    const dir = query.dir === 'asc' ? 1 : -1;
    const key = keyOf[sort];
    rows.sort((a, b) => {
      const ka = key(a); const kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir || a.name.localeCompare(b.name);
    });
    return rows;
  }

  async listShops(query: AdminShopListQuery = {}) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const rows = await this.shopRows(query);
    return {
      shops: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
    };
  }

  /** The same filtered, sorted list as flat rows for a spreadsheet. */
  async exportShopsRows(query: AdminShopListQuery = {}) {
    return (await this.shopRows(query)).map((r) => ({
      name: r.name,
      slug: r.slug,
      address: r.storefrontUrl,
      status: r.status,
      plan: r.billingPlan,
      trialEndsAt: r.trialEndsAt?.toISOString() ?? '',
      currency: r.currency,
      products: r.productCount,
      orders: r.orderCount,
      customers: r.customerCount,
      paidRevenue: r.paidRevenue,
      lastOrderAt: r.lastOrderAt?.toISOString() ?? '',
      lastLoginAt: r.lastLoginAt?.toISOString() ?? '',
      paymentsReady: r.paymentReady ? 'yes' : 'no',
      createdAt: r.createdAt.toISOString(),
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

    const [orderCount, paid, auditLog] = await Promise.all([
      this.prisma.order.count({ where: { shopId } }),
      this.prisma.order.aggregate({ where: { shopId, status: 'PAID' }, _count: { _all: true }, _sum: { totalKes: true } }),
      this.prisma.adminAuditLog.findMany({
        where: { shopId },
        include: { admin: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    // Strip the actual Paystack keys before returning -- this endpoint's
    // caller only ever needs to know whether they're set, never their
    // values, same reasoning as listShops's paymentReady.
    const { paystackSecretKey, paystackPublicKey, ...shopWithoutKeys } = shop;

    return {
      ...shopWithoutKeys,
      paymentReady: Boolean(paystackSecretKey && paystackPublicKey),
      trialExpiringSoon: isTrialExpiringSoon(shop.trialEndsAt),
      orderSummary: {
        orderCount,
        paidOrderCount: paid._count._all,
        totalRevenueKes: Number(paid._sum.totalKes ?? 0),
      },
      auditLog,
    };
  }

  /**
   * Promotes a pending domain straight to customDomain, skipping the DNS
   * TXT check DomainVerificationService.verifyDomain otherwise requires --
   * for when an operator has confirmed control out-of-band (a support
   * call) and DNS propagation is just slow. This bypasses the one safety
   * check that service's own header comment calls out as load-bearing, so
   * it must never be silent: always logged, reason optional but the action
   * itself always shows up in this shop's audit trail.
   */
  async forceVerifyDomain(shopId: string, adminId: string, reason?: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    if (!shop.pendingDomain) throw new BadRequestException('No domain is pending verification for this shop');

    const updated = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        customDomain: shop.pendingDomain,
        pendingDomain: null,
        domainVerificationToken: null,
        domainVerifiedAt: new Date(),
      },
    });
    await this.logAction(adminId, shopId, 'domain.force_verified', reason, { domain: shop.pendingDomain });
    return updated;
  }

  async adminDisconnectDomain(shopId: string, adminId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    const domain = shop.customDomain ?? shop.pendingDomain;
    const updated = await this.domainVerification.disconnectDomain(shopId);
    await this.logAction(adminId, shopId, 'domain.disconnected', undefined, { domain });
    return updated;
  }

  /**
   * Attaches a new staff member to a shop -- mirrors
   * OnboardingService.createShop's find-or-create-User pattern, since a
   * person can staff more than one shop and re-creating their User row on
   * a second invite would collide on the unique email. A brand-new user
   * gets a random password, returned once in the response and never
   * stored/logged in plaintext anywhere -- the same "shown once" handling
   * this session already used for the platform-admin account created by
   * hand earlier. They reset it via the portal's own change-password flow
   * after first login, same as any new hire.
   */
  async inviteStaff(shopId: string, adminId: string, data: { email: string; firstName: string; lastName: string; role: ShopRole }) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    let user = await findUserByEmail(this.prisma, data.email);
    let temporaryPassword: string | undefined;

    if (user) {
      const existingMembership = await this.prisma.userShop.findUnique({
        where: { userId_shopId: { userId: user.id, shopId } },
      });
      if (existingMembership) throw new BadRequestException('This person already has access to this shop');
    } else {
      temporaryPassword = randomBytes(9).toString('base64').replace(/[+/=]/g, '');
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      user = await this.prisma.user.create({
        data: { email: normaliseEmail(data.email), passwordHash, firstName: data.firstName, lastName: data.lastName },
      });
    }

    await this.prisma.userShop.create({ data: { userId: user.id, shopId, role: data.role } });
    await this.logAction(adminId, shopId, 'staff.invited', undefined, { userId: user.id, email: user.email, role: data.role });

    // Best-effort, additive to the on-screen temporary password -- never
    // blocks the invite itself if SMTP is unconfigured or the send fails
    // (see EmailService.send's own comment). Only sent for a brand-new
    // account; an existing user being added to another shop keeps their
    // existing password and has nothing new to be emailed.
    if (temporaryPassword) {
      const { subject, html } = staffInviteEmail({
        shopName: shop.name,
        firstName: data.firstName,
        email: data.email,
        temporaryPassword,
        portalUrl: `${storefrontOriginForShop(shop)}/portal/login`,
      });
      await this.email.send(data.email, subject, html, undefined, { kind: 'invite', shopId });
    }

    return {
      userId: user.id,
      email: user.email,
      // Only present for a brand-new account -- an existing user keeps
      // their existing password, nothing to show here.
      temporaryPassword,
    };
  }

  /**
   * Refuses to remove a shop's only OWNER -- without at least one, nobody
   * could ever administer it again through normal means (no self-service
   * "reassign ownership" flow exists), and support would be back to
   * fixing it by hand via SQL, the exact thing this batch exists to avoid.
   */
  async removeStaff(shopId: string, adminId: string, userId: string) {
    const membership = await this.prisma.userShop.findUnique({ where: { userId_shopId: { userId, shopId } } });
    if (!membership) throw new NotFoundException('This person does not have access to this shop');

    if (membership.role === 'OWNER') {
      const ownerCount = await this.prisma.userShop.count({ where: { shopId, role: 'OWNER' } });
      if (ownerCount <= 1) throw new BadRequestException('Cannot remove the only owner of a shop');
    }

    await this.prisma.userShop.delete({ where: { userId_shopId: { userId, shopId } } });
    await this.logAction(adminId, shopId, 'staff.removed', undefined, { userId });
    return { success: true };
  }

  /**
   * Finds which shop a product/SKU belongs to -- a support lookup, not a
   * shopper-facing search, so this reuses only the literal multi-word-match
   * half of StorefrontService.listProducts's strategy (no pg_trgm fuzzy
   * fallback; typo tolerance is a nice-to-have here, not required).
   */
  async searchProducts(q: string) {
    const words = q.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const wordClauses: Prisma.ProductWhereInput[] = words.map((word) => ({
      OR: [
        { name: { contains: word, mode: 'insensitive' } },
        { brand: { contains: word, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: word, mode: 'insensitive' } } } },
      ],
    }));

    const products = await this.prisma.product.findMany({
      where: { AND: wordClauses },
      include: { shop: { select: { id: true, name: true, slug: true } }, variants: { select: { sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      isActive: p.isActive,
      skus: p.variants.map((v) => v.sku),
      shop: p.shop,
    }));
  }

  async setStatus(shopId: string, adminId: string, status: ShopStatus, reason?: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');
    const updated = await this.prisma.shop.update({ where: { id: shopId }, data: { status } });
    await this.logAction(adminId, shopId, 'shop.status_changed', reason, { from: shop.status, to: status });

    // Tell the owners when the shop is closed or reopened -- a merchant who finds
    // their storefront dead with no explanation will assume it's broken. Best
    // effort (see EmailService.send): never blocks the status change itself.
    const closing = status === 'SUSPENDED' && shop.status !== 'SUSPENDED';
    const reopening = status !== 'SUSPENDED' && shop.status === 'SUSPENDED';
    if (closing || reopening) {
      const owners = await this.prisma.userShop.findMany({ where: { shopId, role: 'OWNER' }, include: { user: { select: { email: true } } } });
      const { subject, html } = shopStatusEmail({ shopName: shop.name, suspended: closing, portalUrl: `${storefrontOriginForShop(shop)}/portal/login` });
      await Promise.all(owners.map((o) => this.email.send(o.user.email, subject, html, undefined, { kind: 'shop_status', shopId })));
    }
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

    // `imp` marks this as a support session: the portal shows a banner, notes
    // are credited to "platform support", and account-level changes (password,
    // profile, staff) are refused. It expires on its own -- it is the owner's real
    // login, so it must never be a long-lived token.
    const payload = { sub: membership.user.id, email: membership.user.email, shopId, role: membership.role, imp: adminId };
    await this.logAction(adminId, shopId, 'shop.impersonated', undefined, { asUserId: membership.user.id });

    return {
      access_token: this.jwtService.sign(payload, { expiresIn: IMPERSONATION_TTL_SECONDS }),
      expiresInSeconds: IMPERSONATION_TTL_SECONDS,
      shopSlug: shop.slug,
    };
  }

  private async logAction(adminId: string, shopId: string | null, action: string, reason?: string, metadata?: Prisma.InputJsonValue) {
    await this.prisma.adminAuditLog.create({
      data: { adminId, shopId, action, reason, metadata },
    });
  }

  /** Cross-platform totals for the admin dashboard -- deliberately as shallow as the per-shop sales tally (design doc S:2.3): counts and sums read straight off existing tables, no new reporting schema, no per-shop breakdown beyond what listShops already gives. */
  async platformStats() {
    const [shopCount, activeShopCount, totalOrders, paid, totalCustomers] = await Promise.all([
      this.prisma.shop.count(),
      this.prisma.shop.count({ where: { status: 'ACTIVE' } }),
      this.prisma.order.count(),
      // Summed by the database -- not by loading every paid order into memory.
      this.prisma.order.aggregate({ where: { status: 'PAID' }, _count: { _all: true }, _sum: { totalKes: true } }),
      this.prisma.customer.count(),
    ]);

    return {
      shopCount,
      activeShopCount,
      totalOrders,
      paidOrderCount: paid._count._all,
      totalRevenueKes: Number(paid._sum.totalKes ?? 0),
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
      take: Math.min(200, Math.max(1, Number.isFinite(limit) ? limit : 50)),
      orderBy: { createdAt: 'desc' },
      include: {
        shop: { select: { id: true, name: true, slug: true } },
        lines: true,
      },
    });
  }

  /**
   * Manual billing tracking -- see Shop.billingPlan's own schema comment
   * for why this isn't a payment-gateway integration. Only the fields
   * actually present in the body are changed, same partial-update shape
   * ShopService.updateTheme already uses; logs a from/to diff per changed
   * field, same shape as setStatus's own audit entry.
   */
  async updateBilling(shopId: string, adminId: string, data: { billingPlan?: BillingPlan; trialEndsAt?: Date | null; billingNotes?: string }) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException('Shop not found');

    const updated = await this.prisma.shop.update({ where: { id: shopId }, data });

    const diff: Record<string, { from: string | null; to: string | null }> = {};
    if (data.billingPlan !== undefined && data.billingPlan !== shop.billingPlan) {
      diff.billingPlan = { from: shop.billingPlan, to: data.billingPlan };
    }
    if (data.trialEndsAt !== undefined && data.trialEndsAt?.getTime() !== shop.trialEndsAt?.getTime()) {
      diff.trialEndsAt = { from: shop.trialEndsAt?.toISOString() ?? null, to: data.trialEndsAt?.toISOString() ?? null };
    }
    if (data.billingNotes !== undefined && data.billingNotes !== shop.billingNotes) {
      diff.billingNotes = { from: shop.billingNotes, to: data.billingNotes };
    }
    await this.logAction(adminId, shopId, 'billing.updated', undefined, diff);

    return updated;
  }

  /**
   * Finds a person to promote/demote -- every User, not just current
   * admins, since the whole point is finding someone who is *currently*
   * shop staff (found via listShops/getShop) and making them a platform
   * admin too. Each row lists the shops the person belongs to and when
   * they last logged in.
   */
  async listUsers(query: { search?: string; admin?: boolean; page?: number; pageSize?: number } = {}) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const words = (query.search ?? '').trim().split(/\s+/).filter(Boolean);
    const where: Prisma.UserWhereInput = {
      ...(query.admin !== undefined ? { isSuperAdmin: query.admin } : {}),
      ...(words.length
        ? {
            AND: words.map((word) => ({
              OR: [
                { email: { contains: word, mode: 'insensitive' as const } },
                { firstName: { contains: word, mode: 'insensitive' as const } },
                { lastName: { contains: word, mode: 'insensitive' as const } },
              ],
            })),
          }
        : {}),
    };

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true, isSuperAdmin: true, createdAt: true, lastLoginAt: true,
          shops: { select: { role: true, shop: { select: { id: true, name: true, slug: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      users: users.map(({ shops, ...u }) => ({ ...u, shops: shops.map((m) => ({ ...m.shop, role: m.role })) })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Refuses to let an admin demote their own account -- with no other
   * admin to undo it, that's a real, avoidable lockout (the same class of
   * failure AdminJwtGuard's re-check-every-request design already exists
   * to catch quickly, not one this action should invite in the first
   * place). Not shop-scoped (shopId: null in the log) -- this action isn't
   * about any one shop.
   */
  async setSuperAdmin(callerId: string, targetUserId: string, isSuperAdmin: boolean) {
    if (targetUserId === callerId && !isSuperAdmin) {
      throw new BadRequestException('You cannot remove your own admin access');
    }
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isSuperAdmin },
      select: { id: true, email: true, firstName: true, lastName: true, isSuperAdmin: true, createdAt: true },
    });
    await this.logAction(callerId, null, 'admin.super_admin_changed', undefined, {
      targetUserId,
      targetEmail: user.email,
      from: user.isSuperAdmin,
      to: isSuperAdmin,
    });
    return updated;
  }

  /**
   * A shop's full data as one JSON object -- an offboarding/backup
   * artifact, not a streaming/paginated export. Fine at this platform's
   * current data volume (the largest shop this session has 151 products);
   * revisit if a shop's order/customer history grows enough to make a
   * single in-memory Promise.all impractical. Staff rows only carry the
   * user's email/name, never passwordHash, same exclusion getShop already
   * applies.
   */
  async exportShop(shopId: string, adminId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, include: { theme: true } });
    if (!shop) throw new NotFoundException('Shop not found');

    const [products, categories, customers, orders, cartLeads, staff] = await Promise.all([
      this.prisma.product.findMany({ where: { shopId }, include: { variants: true } }),
      this.prisma.productCategory.findMany({ where: { shopId } }),
      // Explicit columns: a bare findMany() also returns each customer's passwordHash.
      this.prisma.customer.findMany({
        where: { shopId },
        select: { id: true, shopId: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true },
      }),
      this.prisma.order.findMany({ where: { shopId }, include: { lines: true } }),
      this.prisma.cartLead.findMany({ where: { shopId }, include: { lines: true } }),
      this.prisma.userShop.findMany({
        where: { shopId },
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
      }),
    ]);

    // Credentials and verification secrets never leave in an export.
    const { paystackSecretKey, paystackPublicKey, domainVerificationToken, ...shopWithoutKeys } = shop;
    await this.logAction(adminId, shopId, 'shop.exported', undefined, undefined);

    return {
      exportedAt: new Date().toISOString(),
      shop: { ...shopWithoutKeys, paymentReady: Boolean(paystackSecretKey && paystackPublicKey) },
      products,
      categories,
      customers,
      orders,
      cartLeads,
      staff,
    };
  }

  /**
   * Everything operators have done on the platform -- not just per shop. Actions
   * with no shop (promoting an admin, changing SMTP, admin logins) used to be
   * recorded but shown nowhere, because the only view was a shop's own page.
   */
  async listAudit(query: { action?: string; shopId?: string; adminId?: string; from?: Date; to?: Date; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
    const validDate = (d?: Date) => (d && !Number.isNaN(d.getTime()) ? d : undefined);
    const from = validDate(query.from);
    const to = validDate(query.to);
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.shopId ? { shopId: query.shopId } : {}),
      ...(query.adminId ? { adminId: query.adminId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const [total, entries, actions, admins] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        include: { admin: { select: { email: true } }, shop: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.adminAuditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } }),
      this.prisma.user.findMany({ where: { isSuperAdmin: true }, select: { id: true, email: true }, orderBy: { email: 'asc' } }),
    ]);
    return {
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      // For the filter dropdowns.
      actions: actions.map((a) => a.action),
      admins,
    };
  }

  /** Whether the platform's email is actually getting out, newest first, with a 7-day tally. */
  async listEmailLog(query: { status?: string; kind?: string; search?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));
    const where: Prisma.EmailLogWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.search ? { OR: [{ to: { contains: query.search, mode: 'insensitive' } }, { subject: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
    const since = new Date(Date.now() - 7 * DAY_MS);
    const [total, rows, tally] = await Promise.all([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.emailLog.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    ]);

    const shopIds = Array.from(new Set(rows.map((r) => r.shopId).filter((id): id is string => Boolean(id))));
    const shops = shopIds.length ? await this.prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, name: true, slug: true } }) : [];
    const shopById = new Map(shops.map((s) => [s.id, s]));

    const count = (status: string) => tally.find((t) => t.status === status)?._count._all ?? 0;
    return {
      emails: rows.map((r) => ({ ...r, shop: r.shopId ? shopById.get(r.shopId) ?? null : null })),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      last7Days: { sent: count('SENT'), failed: count('FAILED'), skipped: count('SKIPPED') },
    };
  }
}
