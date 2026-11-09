import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortalCustomerService } from '../portal-customer/portal-customer.service';
import { WhatsAppClient } from '../integrations/whatsapp-client';
import {
  KIND_LABELS, OUTREACH_KINDS, OutreachKind, greetingName, hasVariables, safeUrl, templateFor,
} from './whatsapp-kinds';
import { WhatsappConnectionService } from './whatsapp-connection.service';

export type OutreachResult = { key: string; name: string; phone: string | null; outcome: 'SENT' | 'FAILED' | 'SKIPPED'; detail?: string };

const MAX_UNSENT = 1000;

/**
 * A message counts as received when WhatsApp accepted it and has not reported that it failed. Accepted is not arrived: Meta accepts a
 * message and later reports it undeliverable (a number not on WhatsApp, an account payment problem). Counting those as received would
 * mean the person is never sent it again, however many times the cause is fixed. A message with no report yet counts as received, so
 * it is not sent twice while the report is still on its way.
 */
export const RECEIVED: Prisma.WhatsappOutreachWhereInput = { status: 'SENT', OR: [{ delivery: null }, { delivery: { not: 'failed' } }] };

/**
 * Messages the owner sends customers from the portal, and the welcome series, from the SHOP's own WhatsApp number with the shop's own
 * approved templates. A person who already received a message is skipped unless the owner forces it; nobody who replied STOP is ever
 * messaged; nothing is sent unless the shop has connected WhatsApp and switched it on.
 */
@Injectable()
export class WhatsappOutreachService {
  private readonly logger = new Logger(WhatsappOutreachService.name);
  /** A short pause between sends keeps a batch well inside the API's rate limits and its request time bounded. */
  pauseMs = 150;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: WhatsappConnectionService,
    private readonly customers: PortalCustomerService,
  ) {}

  /** The link each message carries: the group invite and the Google review link the owner set under Store info. */
  private async links(shopId: string): Promise<Record<OutreachKind, string | null>> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { whatsappGroupUrl: true, googleReviewsUrl: true } });
    return { GROUP: safeUrl(shop?.whatsappGroupUrl), REVIEW: safeUrl(shop?.googleReviewsUrl), LOCATION: null, RANGE: null };
  }

  /** Which messages can be sent now: connected, with a template, and a link where the message needs one. */
  async availability(shopId: string) {
    const conn = await this.connections.forShop(shopId);
    const links = await this.links(shopId);
    return {
      configured: Boolean(conn),
      kinds: OUTREACH_KINDS.map((kind) => {
        const template = conn ? templateFor(kind, conn.config) : null;
        const fixedText = !hasVariables(kind);
        const linkReady = fixedText ? true : Boolean(links[kind]);
        return {
          kind, label: KIND_LABELS[kind], template, link: links[kind], linkReady, fixedText,
          ready: Boolean(conn && template && linkReady),
          // What the owner needs to do, when it is not ready.
          missing: !conn ? 'Connect WhatsApp under Connections.' : !template ? 'Name its template under Connections.' : !linkReady ? `Add the ${kind === 'GROUP' ? 'WhatsApp group link' : 'Google review link'} under Store info.` : null,
        };
      }),
    };
  }

  /** People from the customer list (guests and account holders alike), each with when they last received each message. */
  async recipients(shopId: string, query: { page?: number; pageSize?: number; search?: string }) {
    const page = await this.customers.list(shopId, { page: query.page, pageSize: query.pageSize, search: query.search, sort: 'recent' });
    const phones = page.customers.map((c) => WhatsAppClient.normalisePhone(c.phone ?? '')).filter((p): p is string => Boolean(p));
    const sent = await this.prisma.whatsappOutreach.groupBy({ by: ['phone', 'kind'], where: { shopId, phone: { in: phones }, ...RECEIVED }, _max: { createdAt: true } });
    const byPhone = new Map<string, Partial<Record<OutreachKind, Date>>>();
    for (const row of sent) {
      if (!row._max.createdAt) continue;
      const entry = byPhone.get(row.phone) ?? {};
      entry[row.kind as OutreachKind] = row._max.createdAt;
      byPhone.set(row.phone, entry);
    }
    return {
      ...page,
      customers: page.customers.map((c) => {
        const phone = WhatsAppClient.normalisePhone(c.phone ?? '');
        return { ...c, usablePhone: Boolean(phone), sent: (phone && byPhone.get(phone)) || {} };
      }),
    };
  }

  /** Everyone matching the search who has a usable phone and has not yet received `kind`, so the owner can message "everyone who hasn't had it". */
  async unsentKeys(shopId: string, kind: OutreachKind, search?: string) {
    const people = await this.customers.messageable(shopId, { search, limit: 5000 });
    const phoneOf = new Map(people.map((p) => [p.key, WhatsAppClient.normalisePhone(p.phone ?? '')]));
    const received = new Set(
      (await this.prisma.whatsappOutreach.findMany({ where: { shopId, kind, ...RECEIVED }, select: { phone: true } })).map((r) => r.phone),
    );
    const stopped = new Set((await this.prisma.whatsappContact.findMany({ where: { shopId, subscribed: false, unsubscribedReason: 'STOP' }, select: { phone: true } })).map((c) => c.phone));
    const keys = people.filter((p) => { const phone = phoneOf.get(p.key); return phone && !received.has(phone) && !stopped.has(phone); }).map((p) => p.key);
    return { keys: keys.slice(0, MAX_UNSENT), capped: keys.length > MAX_UNSENT };
  }

  /** True when the number replied STOP (or the owner unsubscribed it). Applies to every message, whoever starts it. */
  async repliedStop(shopId: string, phone: string): Promise<boolean> {
    const row = await this.prisma.whatsappContact.findFirst({ where: { shopId, phone: phone.replace(/\D/g, ''), subscribed: false, unsubscribedReason: 'STOP' }, select: { id: true } });
    return Boolean(row);
  }

  private async record(shopId: string, data: { key?: string | null; name?: string | null; phone: string; kind: OutreachKind; template: string; contactId?: string; triggeredBy: string }, sent: { delivered: boolean; messageId?: string; error?: string }) {
    await this.prisma.whatsappOutreach
      .create({
        data: {
          shopId, customerKey: data.key ?? null, name: data.name ?? null, phone: data.phone, kind: data.kind, template: data.template, contactId: data.contactId,
          status: sent.delivered ? 'SENT' : 'FAILED', messageId: sent.messageId, error: sent.error?.slice(0, 500), triggeredBy: data.triggeredBy,
        },
      })
      .catch((error) => this.logger.warn(`Could not record outreach to ${data.phone}: ${error instanceof Error ? error.message : error}`));
  }

  async send(shopId: string, params: { kind: OutreachKind; keys: string[]; force?: boolean; triggeredBy: string }) {
    const conn = await this.connections.forShop(shopId);
    if (!conn) throw new BadRequestException('WhatsApp is not connected for this shop. Connect it under Connections and switch it on.');
    const template = templateFor(params.kind, conn.config);
    if (!template) throw new BadRequestException(`There is no template for "${KIND_LABELS[params.kind]}". Name it under Connections.`);
    const link = (await this.links(shopId))[params.kind];
    if (hasVariables(params.kind) && !link) {
      throw new BadRequestException(`There is no link for "${KIND_LABELS[params.kind]}" yet. Add the ${params.kind === 'GROUP' ? 'WhatsApp group link' : 'Google review link'} under Store info.`);
    }

    const keys = [...new Set(params.keys)];
    const people = new Map((await this.customers.messageable(shopId, { keys, limit: keys.length || 1 })).map((p) => [p.key, p]));
    const phones = keys.map((k) => WhatsAppClient.normalisePhone(people.get(k)?.phone ?? '')).filter((p): p is string => Boolean(p));
    const already = params.force
      ? new Set<string>()
      : new Set((await this.prisma.whatsappOutreach.findMany({ where: { shopId, kind: params.kind, phone: { in: phones }, ...RECEIVED }, select: { phone: true } })).map((r) => r.phone));

    const results: OutreachResult[] = [];
    for (const key of keys) {
      const person = people.get(key);
      if (!person) { results.push({ key, name: 'Unknown customer', phone: null, outcome: 'SKIPPED', detail: 'Customer not found, or has no phone number' }); continue; }
      const phone = WhatsAppClient.normalisePhone(person.phone ?? '');
      if (!phone) { results.push({ key, name: person.name, phone: person.phone, outcome: 'SKIPPED', detail: 'No usable phone number' }); continue; }
      if (already.has(phone)) { results.push({ key, name: person.name, phone, outcome: 'SKIPPED', detail: 'Already sent' }); continue; }
      // Someone who replied STOP is not messaged by anything, including a batch picked here.
      if (await this.repliedStop(shopId, phone)) { results.push({ key, name: person.name, phone, outcome: 'SKIPPED', detail: 'Replied STOP' }); continue; }
      // The same phone twice in one batch (two customer rows, one person) is sent once.
      already.add(phone);

      const sent = await conn.client.sendTemplate(phone, hasVariables(params.kind) ? [greetingName(person.name), link as string] : [], template);
      await this.record(shopId, { key, name: person.name, phone, kind: params.kind, template, triggeredBy: params.triggeredBy }, sent);
      results.push({ key, name: person.name, phone, outcome: sent.delivered ? 'SENT' : 'FAILED', detail: sent.error });
      if (this.pauseMs) await new Promise((r) => setTimeout(r, this.pauseMs));
    }
    const count = (outcome: OutreachResult['outcome']) => results.filter((r) => r.outcome === outcome).length;
    return { sent: count('SENT'), failed: count('FAILED'), skipped: count('SKIPPED'), results };
  }

  /**
   * One message to a phone number rather than a customer: the welcome series for people who messaged the shop. The same rules as everywhere
   * else: nobody who replied STOP, nobody who already received this message (whoever sent it), and a message with no link is not sent.
   */
  async sendToPhone(shopId: string, params: { kind: OutreachKind; phone: string; name?: string | null; contactId?: string; triggeredBy: string }): Promise<{ outcome: 'SENT' | 'FAILED' | 'SKIPPED'; detail?: string }> {
    const conn = await this.connections.forShop(shopId);
    if (!conn) return { outcome: 'FAILED', detail: 'WhatsApp is not connected for this shop.' };
    const phone = WhatsAppClient.normalisePhone(params.phone);
    if (!phone) return { outcome: 'SKIPPED', detail: 'No usable phone number' };
    if (await this.repliedStop(shopId, phone)) return { outcome: 'SKIPPED', detail: 'Replied STOP' };
    if (await this.prisma.whatsappOutreach.findFirst({ where: { shopId, phone, kind: params.kind, ...RECEIVED }, select: { id: true } })) return { outcome: 'SKIPPED', detail: 'Already sent' };
    const template = templateFor(params.kind, conn.config);
    if (!template) return { outcome: 'FAILED', detail: `There is no template for "${KIND_LABELS[params.kind]}".` };
    const link = hasVariables(params.kind) ? (await this.links(shopId))[params.kind] : null;
    if (hasVariables(params.kind) && !link) return { outcome: 'FAILED', detail: `There is no link for "${KIND_LABELS[params.kind]}" yet.` };

    const sent = await conn.client.sendTemplate(phone, hasVariables(params.kind) ? [greetingName(params.name), link as string] : [], template);
    await this.record(shopId, { name: params.name, phone, kind: params.kind, template, contactId: params.contactId, triggeredBy: params.triggeredBy }, sent);
    return sent.delivered ? { outcome: 'SENT' } : { outcome: 'FAILED', detail: sent.error };
  }

  async history(shopId: string, query: { page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
    const [items, total] = await Promise.all([
      this.prisma.whatsappOutreach.findMany({ where: { shopId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.whatsappOutreach.count({ where: { shopId } }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
