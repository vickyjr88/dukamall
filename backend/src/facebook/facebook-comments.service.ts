import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { startOfNairobiDay } from '../whatsapp/whatsapp-subscription';
import {
  ALREADY_REPLIED_CODES, FeedComment, fillTemplate, isReplyToComment, isTransientFacebookError, looksLikeSpam,
} from './facebook-comments';
import { FacebookConnectionService, ShopFacebook } from './facebook-connection.service';

const DAY_MS = 86_400_000;
const TICK_MS = 5 * 60_000;
/** A private reply can only be sent within 7 days of the comment; a day short of that is the last time we try. */
const REPLY_WINDOW_MS = 6 * DAY_MS;
const MAX_ATTEMPTS = 3;
const RETRY_AFTER_MS = 4 * 60_000;
/** A reply left PENDING (the backend stopped mid-send) is looked at again after this long. */
const STUCK_AFTER_MS = 10 * 60_000;
const GRAPH = 'https://graph.facebook.com/v21.0';

type Sent<T = {}> = ({ ok: true } & T) | { ok: false; error: string; code?: number; transient: boolean };

/**
 * Opens a conversation with everyone who comments on a shop's Facebook Page posts and ads. Facebook lets a Page send one private message to
 * the author of a comment, within 7 days (a "private reply"); it appears in their Messenger, where the shop answers from its Page inbox.
 * It carries the shop's WhatsApp link and an invitation to follow the Page, and a short public reply under the comment says a message is
 * on its way. Nothing is sent to people who only reacted: Facebook has no way to message them.
 *
 * Per shop, and off until the owner switches it on. Guards: one reply per comment (the comment id is unique per shop, so Facebook
 * delivering an event twice does nothing), one per person per 7 days, top-level comments only, no comments with links, the shop's daily
 * cap, and the Page's own comments are never answered.
 */
@Injectable()
export class FacebookCommentsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(FacebookCommentsService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly connections: FacebookConnectionService) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.safeRetry(), TICK_MS);
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeRetry() {
    try {
      await this.retryDue();
    } catch (error) {
      this.logger.error(`Facebook comment retry failed: ${(error as Error).message}`);
    }
  }

  // --- Facebook ---------------------------------------------------------------------------------------------------------

  private async graph(conn: ShopFacebook, path: string, body: unknown, method: 'POST' | 'GET' = 'POST'): Promise<{ status: number; data: any } | null> {
    try {
      const response = await fetch(`${GRAPH}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20_000),
      });
      return { status: response.status, data: await response.json().catch(() => ({})) };
    } catch (error) {
      this.logger.warn(`Facebook ${path} failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private failure(r: { status: number; data: any } | null): { ok: false; error: string; code?: number; transient: boolean } {
    if (!r) return { ok: false, error: 'Facebook could not be reached', transient: true };
    const e = r.data?.error;
    const code = typeof e?.code === 'number' ? e.code : undefined;
    return { ok: false, error: [code, e?.error_user_msg || e?.message || `HTTP ${r.status}`].filter((x) => x !== undefined).join(': ').slice(0, 400), code, transient: isTransientFacebookError(code, r.status) };
  }

  /** The one private message to the author of a comment. */
  private async privateReply(conn: ShopFacebook, commentId: string, text: string): Promise<Sent<{ recipientId?: string; messageId?: string }>> {
    const r = await this.graph(conn, `${conn.pageId}/messages`, { recipient: { comment_id: commentId }, message: { text }, messaging_type: 'RESPONSE' });
    if (r && r.status < 300 && r.data?.message_id) return { ok: true, recipientId: r.data.recipient_id, messageId: r.data.message_id };
    return this.failure(r);
  }

  private async publicReply(conn: ShopFacebook, commentId: string, text: string): Promise<Sent<{ id?: string }>> {
    const r = await this.graph(conn, `${commentId}/comments`, { message: text });
    if (r && r.status < 300 && r.data?.id) return { ok: true, id: r.data.id };
    return this.failure(r);
  }

  /** Whether Facebook will send this Page's comments to the shop at all: the Page must be subscribed to the app's `feed`. */
  async subscription(shopId: string): Promise<{ subscribed: boolean; error?: string }> {
    const conn = await this.connections.forShop(shopId);
    if (!conn) return { subscribed: false, error: 'Facebook is not connected for this shop.' };
    const r = await this.graph(conn, `${conn.pageId}/subscribed_apps`, null, 'GET');
    if (!r || r.status >= 300) return { subscribed: false, error: this.failure(r).error };
    const fields: string[] = (r.data?.data ?? []).flatMap((a: any) => a?.subscribed_fields ?? []);
    return { subscribed: fields.includes('feed') };
  }

  // --- the rules --------------------------------------------------------------------------------------------------------

  private async skip(id: string, detail: string) {
    await this.prisma.facebookCommentReply.update({ where: { id }, data: { status: 'SKIPPED', detail } });
    return 'SKIPPED' as const;
  }

  /** What to do with one new comment on a shop's Page. Safe to call twice for the same comment: the second time does nothing. */
  async handleComment(shopId: string, comment: FeedComment): Promise<'IGNORED' | 'DUPLICATE' | 'SKIPPED' | 'SENT' | 'RETRY' | 'FAILED'> {
    const conn = await this.connections.forShop(shopId);
    if (!conn || !conn.settings.commentReplies) return 'IGNORED';
    // The Page's own comments (including our public reply) are not answered, and a comment on another Page is not this shop's.
    if (comment.fromId && comment.fromId === conn.pageId) return 'IGNORED';
    if (comment.pageId && comment.pageId !== conn.pageId) return 'IGNORED';

    let row;
    try {
      row = await this.prisma.facebookCommentReply.create({
        data: {
          shopId, commentId: comment.commentId, postId: comment.postId, pageId: comment.pageId ?? conn.pageId, fromId: comment.fromId,
          fromName: comment.fromName, message: comment.message?.slice(0, 500) ?? null, commentedAt: comment.createdAt,
        },
      });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return 'DUPLICATE';
      throw error;
    }

    if (isReplyToComment(comment)) return this.skip(row.id, 'A reply to another comment');
    if (!comment.fromId) return this.skip(row.id, 'No commenter id from Facebook');
    if (looksLikeSpam(comment.message)) return this.skip(row.id, 'The comment has a link');

    const since = new Date(Date.now() - 7 * DAY_MS);
    const already = await this.prisma.facebookCommentReply.count({ where: { shopId, fromId: comment.fromId, status: 'SENT', repliedAt: { gte: since }, id: { not: row.id } } });
    if (already) return this.skip(row.id, 'Already messaged this person this week');

    const today = await this.prisma.facebookCommentReply.count({ where: { shopId, status: 'SENT', repliedAt: { gte: startOfNairobiDay(new Date()) } } });
    if (today >= conn.settings.dailyCap) return this.skip(row.id, `Daily limit of ${conn.settings.dailyCap} reached`);

    return this.reply(row.id, conn);
  }

  /** Sends the private reply (then the public one) for a row, and records what happened. */
  private async reply(id: string, conn: ShopFacebook): Promise<'SENT' | 'RETRY' | 'FAILED' | 'SKIPPED'> {
    const row = await this.prisma.facebookCommentReply.findUniqueOrThrow({ where: { id } });
    const vars = { name: row.fromName, ...conn.facts };
    const attempts = row.attempts + 1;

    const sent = await this.privateReply(conn, row.commentId, fillTemplate(conn.settings.privateText, vars));
    if (!sent.ok) {
      if (sent.code !== undefined && ALREADY_REPLIED_CODES.has(sent.code)) {
        await this.prisma.facebookCommentReply.update({ where: { id }, data: { status: 'SKIPPED', detail: 'Already answered privately', attempts } });
        return 'SKIPPED';
      }
      const retry = sent.transient && attempts < MAX_ATTEMPTS;
      await this.prisma.facebookCommentReply.update({ where: { id }, data: { status: retry ? 'RETRY' : 'FAILED', detail: sent.error, attempts } });
      if (!retry) this.logger.warn(`Shop ${row.shopId}: private reply to comment ${row.commentId} failed: ${sent.error}`);
      return retry ? 'RETRY' : 'FAILED';
    }

    // Said only after the private message went, so the public line is never a promise that was not kept.
    let detail: string | null = null;
    let publicId: string | undefined;
    if (conn.settings.publicReply) {
      const pub = await this.publicReply(conn, row.commentId, fillTemplate(conn.settings.publicText, vars));
      if (pub.ok) publicId = pub.id;
      else detail = `Private reply sent; the public reply failed: ${pub.error}`;
    }
    await this.prisma.facebookCommentReply.update({
      where: { id },
      data: { status: 'SENT', detail, attempts, recipientId: sent.recipientId, privateMessageId: sent.messageId, publicReplyId: publicId, repliedAt: new Date() },
    });
    return 'SENT';
  }

  /** Replies that failed for a reason that may pass (Facebook down, rate limited), tried again while the 7 days last, across every shop. */
  async retryDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.facebookCommentReply.findMany({
      where: {
        attempts: { lt: MAX_ATTEMPTS },
        createdAt: { gte: new Date(now.getTime() - REPLY_WINDOW_MS) },
        OR: [
          { status: 'RETRY', updatedAt: { lt: new Date(now.getTime() - RETRY_AFTER_MS) } },
          { status: 'PENDING', updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });
    let done = 0;
    for (const row of due) {
      try {
        // Take it before sending, so the other backend slot does not send it too.
        const claimed = await this.prisma.facebookCommentReply.updateMany({ where: { id: row.id, status: row.status, updatedAt: row.updatedAt }, data: { status: 'PENDING' } });
        if (claimed.count !== 1) continue;
        const conn = await this.connections.forShop(row.shopId);
        if (!conn || !conn.settings.commentReplies) { await this.skip(row.id, 'Comment replies were switched off before this could be sent'); continue; }
        await this.reply(row.id, conn);
        done += 1;
      } catch (error) {
        // One shop's trouble never stops another's.
        this.logger.error(`Facebook retry for shop ${row.shopId} failed: ${(error as Error).message}`);
      }
    }
    return done;
  }

  // --- for the portal ---------------------------------------------------------------------------------------------------

  async status(shopId: string) {
    const conn = await this.connections.forShop(shopId);
    const [counts, today, subscription] = await Promise.all([
      this.prisma.facebookCommentReply.groupBy({ by: ['status'], where: { shopId }, _count: true }),
      this.prisma.facebookCommentReply.count({ where: { shopId, status: 'SENT', repliedAt: { gte: startOfNairobiDay(new Date()) } } }),
      conn ? this.subscription(shopId) : Promise.resolve({ subscribed: false, error: null as string | null }),
    ]);
    const by = Object.fromEntries(counts.map((c) => [c.status, c._count]));
    return {
      connected: Boolean(conn),
      enabled: Boolean(conn?.settings.commentReplies),
      publicReply: conn?.settings.publicReply ?? true,
      pageId: conn?.pageId ?? null,
      subscribed: subscription.subscribed,
      subscriptionError: subscription.error ?? null,
      sent: by.SENT ?? 0, skipped: by.SKIPPED ?? 0, failed: by.FAILED ?? 0, waiting: (by.RETRY ?? 0) + (by.PENDING ?? 0),
      sentToday: today,
      dailyCap: conn?.settings.dailyCap ?? 200,
    };
  }

  async list(shopId: string, query: { page?: number; pageSize?: number; status?: string }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const where: Prisma.FacebookCommentReplyWhereInput = { shopId, ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.facebookCommentReply.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.facebookCommentReply.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
