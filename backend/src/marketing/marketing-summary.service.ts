import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { socialPostingAllowed } from '../social/social-posting.service';
import { AttentionItem, ConnectionFact, PostTally, ShopMessagingFacts, attentionFor, usesMessaging } from './marketing-health';

export type Period = { start: Date; end: Date; /** "2026-11-08" when the period is one shop-local day: Status pictures are keyed by that day. */ dayKey?: string };

export type ShopMessaging = ShopMessagingFacts & { shopId: string; attention: AttentionItem[]; used: boolean };

const NONE: ConnectionFact = { present: false, enabled: false, lastCheckedAt: null, lastError: null, tokenExpiresAt: null };
const EMPTY_POSTS: PostTally = { posted: 0, failed: 0, topFailure: null };

/** The most common non-empty reason in a list. */
function top(reasons: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const r of reasons) if (r && r.trim()) counts.set(r.trim(), (counts.get(r.trim()) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * What every shop's messaging and posting did in a period, and what needs a person. Read-only, and built to be asked about many shops at once
 * (the operator's page): one grouped query per table, never a query per shop. It never selects a secret.
 */
@Injectable()
export class MarketingSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async forShops(shopIds: string[], period: Period, now = new Date()): Promise<Map<string, ShopMessaging>> {
    const out = new Map<string, ShopMessaging>();
    if (!shopIds.length) return out;
    const inShops = { in: shopIds };
    const inPeriod = { gte: period.start, lt: period.end };

    const [integrations, settings, outreach, contacts, optOuts, comments, posts] = await Promise.all([
      this.prisma.shopIntegration.findMany({ where: { shopId: inShops }, select: { shopId: true, provider: true, enabled: true, config: true, lastCheckedAt: true, lastError: true, tokenExpiresAt: true } }),
      this.prisma.socialSetting.findMany({ where: { shopId: inShops }, select: { shopId: true, facebookEnabled: true, threadsEnabled: true } }),
      this.prisma.whatsappOutreach.findMany({ where: { shopId: inShops, createdAt: inPeriod, status: { in: ['SENT', 'FAILED'] } }, select: { shopId: true, status: true, delivery: true, error: true, deliveryError: true } }),
      this.prisma.whatsappContact.groupBy({ by: ['shopId'], where: { shopId: inShops, createdAt: inPeriod }, _count: { _all: true } }),
      this.prisma.whatsappContact.groupBy({ by: ['shopId'], where: { shopId: inShops, unsubscribedAt: inPeriod, unsubscribedReason: 'STOP' }, _count: { _all: true } }),
      this.prisma.facebookCommentReply.findMany({ where: { shopId: inShops, createdAt: inPeriod }, select: { shopId: true, status: true, detail: true } }),
      this.prisma.socialPost.findMany({ where: { shopId: inShops, createdAt: inPeriod }, select: { shopId: true, channel: true, status: true, detail: true, slotKey: true } }),
    ]);

    const by = <T extends { shopId: string }>(rows: T[]) => {
      const map = new Map<string, T[]>();
      for (const r of rows) map.set(r.shopId, [...(map.get(r.shopId) ?? []), r]);
      return map;
    };
    const integrationsBy = by(integrations);
    const settingsBy = new Map(settings.map((s) => [s.shopId, s]));
    const outreachBy = by(outreach);
    const commentsBy = by(comments);
    const postsBy = by(posts);
    const count = (rows: Array<{ shopId: string; _count: { _all: number } }>) => new Map(rows.map((r) => [r.shopId, r._count._all]));
    const newPeople = count(contacts);
    const stopped = count(optOuts);

    for (const shopId of shopIds) {
      const rows = integrationsBy.get(shopId) ?? [];
      const conn = (provider: string): { fact: ConnectionFact; config: Record<string, unknown> } => {
        const row = rows.find((r) => r.provider === provider);
        return row
          ? { fact: { present: true, enabled: row.enabled, lastCheckedAt: row.lastCheckedAt, lastError: row.lastError, tokenExpiresAt: row.tokenExpiresAt }, config: (row.config ?? {}) as Record<string, unknown> }
          : { fact: NONE, config: {} };
      };
      const wa = conn('WHATSAPP'); const fb = conn('FACEBOOK'); const th = conn('THREADS');
      const setting = settingsBy.get(shopId);

      const sends = outreachBy.get(shopId) ?? [];
      // Accepted is not delivered: a message Meta accepted and later reported as failed counts as failed.
      const reportedFailed = (r: (typeof sends)[number]) => r.status === 'FAILED' || r.delivery === 'failed';
      const failedSends = sends.filter(reportedFailed);

      const replies = commentsBy.get(shopId) ?? [];
      const failedReplies = replies.filter((r) => r.status === 'FAILED');

      const shopPosts = postsBy.get(shopId) ?? [];
      const tally = (channel: string): PostTally => {
        const mine = shopPosts.filter((p) => p.channel === channel);
        const failed = mine.filter((p) => p.status === 'FAILED');
        return { posted: mine.filter((p) => p.status === 'POSTED').length, failed: failed.length, topFailure: top(failed.map((p) => p.detail)) };
      };
      const statusRows = shopPosts.filter((p) => p.channel === 'STATUS' && (!period.dayKey || p.slotKey.startsWith(`${period.dayKey}#`)));

      const facts: ShopMessagingFacts = {
        whatsapp: wa.fact, facebook: fb.fact, threads: th.fact,
        features: {
          welcomeSeries: wa.config.autoSubscribe === 'true',
          commentReplies: fb.config.commentReplies === 'true',
          postFacebook: Boolean(setting?.facebookEnabled),
          postThreads: Boolean(setting?.threadsEnabled),
        },
        postingAllowed: socialPostingAllowed(),
        whatsappActivity: {
          sent: sends.length - failedSends.length,
          failed: failedSends.length,
          delivered: sends.filter((r) => r.delivery === 'delivered' || r.delivery === 'read').length,
          topFailure: top(failedSends.map((r) => r.deliveryError ?? r.error)),
          newPeople: newPeople.get(shopId) ?? 0,
          optOuts: stopped.get(shopId) ?? 0,
        },
        comments: { sent: replies.filter((r) => r.status === 'SENT').length, failed: failedReplies.length, skipped: replies.filter((r) => r.status === 'SKIPPED').length, topFailure: top(failedReplies.map((r) => r.detail)) },
        posts: { facebook: tally('FACEBOOK'), threads: tally('THREADS') },
        status: { prepared: statusRows.length, posted: statusRows.filter((p) => p.status === 'POSTED').length },
      };
      out.set(shopId, { shopId, ...facts, attention: attentionFor(facts, now), used: usesMessaging(facts) });
    }
    return out;
  }

  async forShop(shopId: string, period: Period, now = new Date()): Promise<ShopMessaging> {
    return (await this.forShops([shopId], period, now)).get(shopId)!;
  }

  /** The operator's view: every shop that has any connection, worst first, with the totals the page leads with. */
  async overview(days: 1 | 7, now = new Date()) {
    const period: Period = { start: new Date(now.getTime() - days * 86_400_000), end: now };
    const shops = await this.prisma.shop.findMany({ where: { integrations: { some: {} } }, select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } });
    const total = await this.prisma.shop.count();
    const summaries = await this.forShops(shops.map((s) => s.id), period, now);
    const rank = (m: ShopMessaging) => (m.attention.some((a) => a.severity === 'problem') ? 0 : m.attention.length ? 1 : 2);
    const rows = shops
      .map((s) => ({ shop: s, ...summaries.get(s.id)! }))
      .sort((a, b) => rank(a) - rank(b) || b.attention.length - a.attention.length || a.shop.name.localeCompare(b.shop.name));
    const sum = (pick: (m: ShopMessaging) => number) => rows.reduce((n, r) => n + pick(r), 0);
    return {
      days,
      since: period.start.toISOString(),
      totals: {
        shops: total,
        withConnections: rows.length,
        withProblems: rows.filter((r) => rank(r) === 0).length,
        withWarnings: rows.filter((r) => rank(r) === 1).length,
        whatsappSent: sum((m) => m.whatsappActivity.sent),
        whatsappFailed: sum((m) => m.whatsappActivity.failed),
        commentReplies: sum((m) => m.comments.sent),
        posted: sum((m) => m.posts.facebook.posted + m.posts.threads.posted),
        postsFailed: sum((m) => m.posts.facebook.failed + m.posts.threads.failed),
        statusPrepared: sum((m) => m.status.prepared),
      },
      postingAllowed: socialPostingAllowed(),
      rows,
    };
  }
}
