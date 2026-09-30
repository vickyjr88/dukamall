import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PortalCustomerListQuery = { search?: string; page?: number; pageSize?: number };

@Injectable()
export class PortalCustomerService {
  constructor(private prisma: PrismaService) {}

  // Customer accounts are optional (guest checkout is allowed -- see
  // Order.customerId being nullable), so this is "who has an account with
  // us," not "everyone who's ever bought something." Order count and
  // lifetime value both come from the customer's own PAID orders, computed
  // per-row rather than stored, since there's no running total to keep in
  // sync and the platform's data volumes (a few hundred customers per shop
  // at most today) don't need one.
  async list(shopId: string, query: PortalCustomerListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));

    const where: Prisma.CustomerWhereInput = {
      shopId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    const customerIds = customers.map((c) => c.id);
    const orderAgg = customerIds.length
      ? await this.prisma.order.groupBy({
          by: ['customerId'],
          where: { customerId: { in: customerIds }, status: 'PAID' },
          _count: { _all: true },
          _sum: { totalKes: true },
        })
      : [];

    const rows = customers.map((c) => {
      const agg = orderAgg.find((a) => a.customerId === c.id);
      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        createdAt: c.createdAt,
        paidOrderCount: agg?._count._all ?? 0,
        lifetimeValueKes: Number(agg?._sum.totalKes ?? 0),
      };
    });

    return { customers: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
