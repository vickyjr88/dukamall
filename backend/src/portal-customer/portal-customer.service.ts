import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

/** Digits only, with Kenyan numbers brought to one shape (0712..., 712..., +254712... all match). */
export function normalisePhone(phone?: string | null): string | null {
  let digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (digits.length === 10 && digits.startsWith('0')) digits = `254${digits.slice(1)}`;
  else if (digits.length === 9 && /^[17]/.test(digits)) digits = `254${digits}`;
  return digits;
}

/** The same normalisation as normalisePhone, as SQL, for a column named in our own code (never user input). */
const phoneSql = (column: string) => Prisma.raw(`(
  SELECT CASE
    WHEN length(d) < 7 THEN NULL
    WHEN length(d) = 10 AND d LIKE '0%' THEN '254' || substr(d, 2)
    WHEN length(d) = 9 AND d ~ '^[17]' THEN '254' || d
    ELSE d
  END FROM (SELECT regexp_replace(coalesce(${column}, ''), '\\D', '', 'g') AS d) digits
)`);

// Hard ceiling on one export, so a runaway shop can't build an unbounded file.
const EXPORT_LIMIT = 50000;

/**
 * Who has bought from, or has an account with, a shop -- worked out in the
 * database, so a page of customers costs one query however many orders exist.
 *
 * Most shoppers never create an account (they check out as guests, order over
 * WhatsApp, or are recorded by hand), so listing only account holders hid most
 * of the customer base. Each order is assigned to a person: its own account if
 * it has one, else the account with the same email, else the same phone; guests
 * are keyed by email, or by phone when there's no email. A phone-only order
 * joins the person who last used that phone together with an email, so the same
 * buyer ordering twice with different spellings of their number is one row.
 */
function peopleCte(shopId: string): Prisma.Sql {
  return Prisma.sql`
    acc AS (
      SELECT c.id, c."firstName", c."lastName", c.email, c.phone, c."createdAt",
             lower(nullif(trim(c.email), '')) AS e, ${phoneSql('c.phone')} AS p
      FROM "Customer" c WHERE c."shopId" = ${shopId}
    ),
    ord AS (
      SELECT o.id, o."orderNumber", o."customerId", o."firstName", o."lastName", o.email, o.phone, o.status,
             o."fulfilmentStatus", o.source, o."totalKes", o."createdAt",
             lower(nullif(trim(o.email), '')) AS e, ${phoneSql('o.phone')} AS p
      FROM "Order" o WHERE o."shopId" = ${shopId}
    ),
    acc_e AS (SELECT DISTINCT ON (e) e, id FROM acc WHERE e IS NOT NULL ORDER BY e, "createdAt"),
    acc_p AS (SELECT DISTINCT ON (p) p, id FROM acc WHERE p IS NOT NULL ORDER BY p, "createdAt"),
    phone_email AS (
      SELECT DISTINCT ON (p) p, e FROM ord
      WHERE e IS NOT NULL AND p IS NOT NULL AND "customerId" IS NULL
      ORDER BY p, "createdAt" DESC
    ),
    keyed AS (
      SELECT ord.*,
        CASE
          WHEN ord."customerId" IS NOT NULL THEN 'c_' || ord."customerId"
          WHEN ord.e IS NOT NULL THEN coalesce('c_' || ae.id, 'e_' || ord.e)
          WHEN ord.p IS NOT NULL THEN coalesce('c_' || ap.id, 'c_' || pae.id, 'e_' || pe.e, 'p_' || ord.p)
        END AS key
      FROM ord
      LEFT JOIN acc_e ae ON ae.e = ord.e
      LEFT JOIN acc_p ap ON ap.p = ord.p
      LEFT JOIN phone_email pe ON pe.p = ord.p
      LEFT JOIN acc_e pae ON pae.e = pe.e
    ),
    agg AS (
      SELECT key,
        count(*) FILTER (WHERE status <> 'CANCELLED') AS order_count,
        count(*) FILTER (WHERE status = 'PAID') AS paid_count,
        coalesce(sum("totalKes") FILTER (WHERE status = 'PAID'), 0) AS ltv,
        max("createdAt") FILTER (WHERE status <> 'CANCELLED') AS last_order_at,
        min("createdAt") AS first_order_at,
        (array_agg(trim(concat_ws(' ', "firstName", "lastName")) ORDER BY "createdAt" DESC))[1] AS g_name,
        (array_agg(email ORDER BY "createdAt" DESC) FILTER (WHERE email IS NOT NULL AND email <> ''))[1] AS g_email,
        (array_agg(phone ORDER BY "createdAt" DESC) FILTER (WHERE phone IS NOT NULL AND phone <> ''))[1] AS g_phone
      FROM keyed WHERE key IS NOT NULL GROUP BY key
    ),
    people AS (
      SELECT 'c_' || a.id AS key, true AS has_account,
             trim(concat_ws(' ', a."firstName", a."lastName")) AS name,
             coalesce(a.email, g.g_email) AS email, coalesce(a.phone, g.g_phone) AS phone,
             a."createdAt" AS first_seen, g.last_order_at,
             coalesce(g.order_count, 0) AS order_count, coalesce(g.paid_count, 0) AS paid_count, coalesce(g.ltv, 0) AS ltv
      FROM acc a LEFT JOIN agg g ON g.key = 'c_' || a.id
      UNION ALL
      SELECT g.key, false, g.g_name, g.g_email, g.g_phone, g.first_order_at, g.last_order_at,
             g.order_count, g.paid_count, g.ltv
      FROM agg g WHERE left(g.key, 2) <> 'c_'
    )`;
}

type PersonRow = {
  key: string; has_account: boolean; name: string; email: string | null; phone: string | null;
  first_seen: Date; last_order_at: Date | null; order_count: bigint; paid_count: bigint; ltv: Prisma.Decimal | number | string;
  total?: bigint;
};

const toSummary = (r: PersonRow): CustomerSummary => ({
  key: r.key,
  hasAccount: r.has_account,
  name: r.name ?? '',
  email: r.email,
  phone: r.phone,
  firstSeenAt: r.first_seen,
  lastOrderAt: r.last_order_at,
  orderCount: Number(r.order_count),
  paidOrderCount: Number(r.paid_count),
  lifetimeValueKes: Number(r.ltv),
});

/** Escapes LIKE wildcards so a search for "50%" or "a_b" matches that text, not a pattern. */
const likeEscape = (word: string) => word.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class PortalCustomerService {
  constructor(private prisma: PrismaService) {}

  private searchFilter(search?: string): Prisma.Sql {
    const words = (search ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return Prisma.empty;
    const phoneNeedle = normalisePhone(search);
    const patterns = words.map((w) => `%${likeEscape(w)}%`);
    const wordsMatch = Prisma.sql`lower(name || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '')) LIKE ALL(${patterns}::text[])`;
    if (!phoneNeedle) return Prisma.sql`WHERE ${wordsMatch}`;
    return Prisma.sql`WHERE ${wordsMatch} OR ${phoneSql('phone')} LIKE ${`%${likeEscape(phoneNeedle)}%`}`;
  }

  private orderBy(sort?: PortalCustomerListQuery['sort']): Prisma.Sql {
    const recency = Prisma.sql`coalesce(last_order_at, first_seen) DESC, key`;
    if (sort === 'spent') return Prisma.sql`ORDER BY ltv DESC, ${recency}`;
    if (sort === 'orders') return Prisma.sql`ORDER BY order_count DESC, ${recency}`;
    return Prisma.sql`ORDER BY ${recency}`;
  }

  async list(shopId: string, query: PortalCustomerListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const rows = await this.prisma.$queryRaw<PersonRow[]>(Prisma.sql`
      WITH ${peopleCte(shopId)}
      SELECT *, count(*) OVER () AS total FROM people
      ${this.searchFilter(query.search)}
      ${this.orderBy(query.sort)}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);

    // An empty page past the end has no row to read the total from; ask for it directly.
    const total = rows.length
      ? Number(rows[0].total)
      : Number((await this.prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`
          WITH ${peopleCte(shopId)} SELECT count(*) AS n FROM people ${this.searchFilter(query.search)}`))[0].n);

    return { customers: rows.map(toSummary), total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /** Every customer matching the search, as flat rows for a spreadsheet. */
  async exportRows(shopId: string, query: PortalCustomerListQuery) {
    const rows = await this.prisma.$queryRaw<PersonRow[]>(Prisma.sql`
      WITH ${peopleCte(shopId)}
      SELECT * FROM people ${this.searchFilter(query.search)} ${this.orderBy(query.sort)} LIMIT ${EXPORT_LIMIT}`);
    return rows.map(toSummary).map((c) => ({
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
    const [person] = await this.prisma.$queryRaw<PersonRow[]>(Prisma.sql`
      WITH ${peopleCte(shopId)} SELECT * FROM people WHERE key = ${key} LIMIT 1`);
    if (!person) throw new NotFoundException('Customer not found');
    const summary = toSummary(person);

    const orders = await this.prisma.$queryRaw<{
      id: string; orderNumber: string; status: string; fulfilmentStatus: string; source: string;
      totalKes: Prisma.Decimal | number | string; createdAt: Date;
    }[]>(Prisma.sql`
      WITH ${peopleCte(shopId)}
      SELECT id, "orderNumber", status, "fulfilmentStatus", source, "totalKes", "createdAt"
      FROM keyed WHERE key = ${key} ORDER BY "createdAt" DESC LIMIT 500`);

    // Leads (WhatsApp enquiries, abandoned carts) from the same person, so the
    // full story of how they came to the shop is in one place.
    const accountId = key.startsWith('c_') ? key.slice(2) : null;
    const email = summary.email?.trim().toLowerCase() || null;
    const phone = normalisePhone(summary.phone);
    const leads = await this.prisma.$queryRaw<{
      id: string; source: string; status: string; createdAt: Date; convertedOrderId: string | null;
    }[]>(Prisma.sql`
      SELECT l.id, l.source, l.status, l."createdAt", l."convertedOrderId"
      FROM "CartLead" l
      WHERE l."shopId" = ${shopId}
        AND (
          (${accountId}::text IS NOT NULL AND l."customerId" = ${accountId})
          OR (${email}::text IS NOT NULL AND lower(trim(l."customerEmail")) = ${email})
          OR (${phone}::text IS NOT NULL AND ${phoneSql('l."customerPhone"')} = ${phone})
        )
      ORDER BY l."createdAt" DESC LIMIT 20`);

    return { ...summary, orders: orders.map((o) => ({ ...o, totalKes: Number(o.totalKes) })), leads };
  }
}
