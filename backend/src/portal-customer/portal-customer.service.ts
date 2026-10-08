import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PortalCustomerListQuery = {
  search?: string;
  sort?: 'recent' | 'spent' | 'orders';
  page?: number;
  pageSize?: number;
};

export type CustomerSummary = {
  /** "c_<id>" for an account, "e_<email>" / "p_<digits>" for someone who only ever checked out as a guest. */
  key: string;
  hasAccount: boolean;
  name: string;
  email: string | null;
  phone: string | null;
  firstSeenAt: Date;
  lastOrderAt: Date | null;
  /** Orders that haven't been cancelled. */
  orderCount: number;
  paidOrderCount: number;
  lifetimeValueKes: number;
};

type OrderRow = {
  id: string; orderNumber: string; customerId: string | null; firstName: string; lastName: string;
  email: string | null; phone: string | null; status: string; fulfilmentStatus: string; source: string;
  totalKes: unknown; createdAt: Date;
};

/** Digits only, with Kenyan numbers brought to one shape (0712..., 712..., +254712... all match). */
export function normalisePhone(phone?: string | null): string | null {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (digits.length === 10 && digits.startsWith('0')) digits = `254${digits.slice(1)}`;
  else if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`;
  return digits;
}

const normaliseEmail = (email?: string | null) => (email?.trim().toLowerCase() || null);

// A hard stop on how many orders are read to build the picture of "who buys
// from this shop" -- generous for a shop this size, and a bound if one isn't.
const MAX_ORDERS_SCANNED = 20000;

@Injectable()
export class PortalCustomerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Everyone who has bought from, or has an account with, this shop.
   *
   * Most shoppers never create an account -- they check out as guests, order
   * over WhatsApp, or are recorded by hand -- so listing only account holders
   * (as this used to) hid most of the customer base. People are matched by
   * account first, then email, then phone, so the same person ordering twice
   * with a different spelling of their number is still one customer.
   */
  private async build(shopId: string) {
    const [accounts, orders] = await Promise.all([
      this.prisma.customer.findMany({ where: { shopId } }),
      this.prisma.order.findMany({
        where: { shopId },
        select: {
          id: true, orderNumber: true, customerId: true, firstName: true, lastName: true, email: true, phone: true,
          status: true, fulfilmentStatus: true, source: true, totalKes: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_ORDERS_SCANNED,
      }),
    ]);

    const accountByEmail = new Map<string, string>();
    const accountByPhone = new Map<string, string>();
    for (const a of accounts) {
      const e = normaliseEmail(a.email);
      const p = normalisePhone(a.phone);
      if (e) accountByEmail.set(e, a.id);
      if (p) accountByPhone.set(p, a.id);
    }

    // A guest order with an email and a phone teaches us that phone belongs to that
    // email, so a later phone-only order (e.g. over WhatsApp) joins the same person.
    const phoneToEmailKey = new Map<string, string>();
    for (const o of orders) {
      const e = normaliseEmail(o.email);
      const p = normalisePhone(o.phone);
      if (e && p && !o.customerId && !phoneToEmailKey.has(p)) phoneToEmailKey.set(p, `e_${e}`);
    }

    const keyOf = (o: OrderRow): string | null => {
      if (o.customerId) return `c_${o.customerId}`;
      const e = normaliseEmail(o.email);
      const p = normalisePhone(o.phone);
      if (e) return accountByEmail.has(e) ? `c_${accountByEmail.get(e)}` : `e_${e}`;
      if (p) {
        if (accountByPhone.has(p)) return `c_${accountByPhone.get(p)}`;
        return phoneToEmailKey.get(p) ?? `p_${p}`;
      }
      return null; // an order with no way to contact the buyer
    };

    const people = new Map<string, CustomerSummary & { orders: OrderRow[] }>();
    for (const a of accounts) {
      people.set(`c_${a.id}`, {
        key: `c_${a.id}`,
        hasAccount: true,
        name: [a.firstName, a.lastName].filter(Boolean).join(' '),
        email: a.email,
        phone: a.phone,
        firstSeenAt: a.createdAt,
        lastOrderAt: null,
        orderCount: 0,
        paidOrderCount: 0,
        lifetimeValueKes: 0,
        orders: [],
      });
    }

    // Orders are newest first, so the first one seen for a guest has their latest details.
    for (const o of orders) {
      const key = keyOf(o);
      if (!key) continue;
      let person = people.get(key);
      if (!person) {
        person = {
          key,
          hasAccount: false,
          name: [o.firstName, o.lastName].filter(Boolean).join(' '),
          email: o.email,
          phone: o.phone,
          firstSeenAt: o.createdAt,
          lastOrderAt: null,
          orderCount: 0,
          paidOrderCount: 0,
          lifetimeValueKes: 0,
          orders: [],
        };
        people.set(key, person);
      }
      if (!person.email && o.email) person.email = o.email;
      if (!person.phone && o.phone) person.phone = o.phone;
      if (o.createdAt < person.firstSeenAt && !person.hasAccount) person.firstSeenAt = o.createdAt;
      person.orders.push(o);
      if (o.status === 'CANCELLED') continue;
      person.orderCount += 1;
      if (!person.lastOrderAt || o.createdAt > person.lastOrderAt) person.lastOrderAt = o.createdAt;
      if (o.status === 'PAID') {
        person.paidOrderCount += 1;
        person.lifetimeValueKes += Number(o.totalKes);
      }
    }
    return people;
  }

  async list(shopId: string, query: PortalCustomerListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const all = this.filterAndSort(await this.build(shopId), query);
    const customers = all.slice((page - 1) * pageSize, page * pageSize).map(({ orders, ...summary }) => summary);
    return { customers, total: all.length, page, pageSize, totalPages: Math.max(1, Math.ceil(all.length / pageSize)) };
  }

  /** Every customer matching the search, as flat rows for a spreadsheet. */
  async exportRows(shopId: string, query: PortalCustomerListQuery) {
    return this.filterAndSort(await this.build(shopId), query).map((c) => ({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      hasAccount: c.hasAccount ? 'yes' : 'no',
      firstSeen: c.firstSeenAt.toISOString(),
      lastOrder: c.lastOrderAt?.toISOString() ?? '',
      orders: c.orderCount,
      paidOrders: c.paidOrderCount,
      lifetimeValueKes: c.lifetimeValueKes,
    }));
  }

  async get(shopId: string, key: string) {
    const person = (await this.build(shopId)).get(key);
    if (!person) throw new NotFoundException('Customer not found');
    const { orders, ...summary } = person;

    // Leads (WhatsApp enquiries, abandoned carts) from the same person, so the
    // full story of how they came to the shop is in one place.
    const e = normaliseEmail(person.email);
    const p = normalisePhone(person.phone);
    const accountId = key.startsWith('c_') ? key.slice(2) : null;
    const leads = (await this.prisma.cartLead.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      select: { id: true, source: true, status: true, customerId: true, customerEmail: true, customerPhone: true, createdAt: true, convertedOrderId: true },
    })).filter((l) =>
      (accountId && l.customerId === accountId)
      || (e && normaliseEmail(l.customerEmail) === e)
      || (p && normalisePhone(l.customerPhone) === p),
    ).slice(0, 20);

    return {
      ...summary,
      orders: orders.map((o) => ({ ...o, totalKes: Number(o.totalKes) })),
      leads,
    };
  }

  private filterAndSort(people: Map<string, CustomerSummary & { orders: OrderRow[] }>, query: PortalCustomerListQuery) {
    const words = (query.search ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    const phoneNeedle = normalisePhone(query.search);
    let list = Array.from(people.values());
    if (words.length) {
      list = list.filter((c) => {
        const haystack = `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase();
        const phoneMatch = phoneNeedle && normalisePhone(c.phone)?.includes(phoneNeedle);
        return phoneMatch || words.every((w) => haystack.includes(w));
      });
    }
    const byRecency = (a: CustomerSummary, b: CustomerSummary) =>
      (b.lastOrderAt ?? b.firstSeenAt).getTime() - (a.lastOrderAt ?? a.firstSeenAt).getTime();
    if (query.sort === 'spent') list.sort((a, b) => b.lifetimeValueKes - a.lifetimeValueKes || byRecency(a, b));
    else if (query.sort === 'orders') list.sort((a, b) => b.orderCount - a.orderCount || byRecency(a, b));
    else list.sort(byRecency);
    return list;
  }
}
