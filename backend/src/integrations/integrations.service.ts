import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { IntegrationProvider, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret, secretsKeyConfigured } from '../common/secrets';
import { whatsAppFromEnvironment } from './env-import';
import {
  PROVIDERS, PROVIDER_KEYS, SecretInput, cleanInput, externalIdKey, fieldsOf, requiredKeys, secretHint,
} from './integration-providers';

type Actor = { id?: string | null; email: string; impersonatedBy?: string | null };
type Stored = { enabled: boolean; externalId: string | null; config: Record<string, string>; secrets: Record<string, string> };

/** What a feature gets: the connection with its secrets decrypted. Keep it in a local variable; never log it or put it in an error. */
export type ResolvedConnection = {
  source: 'shop' | 'platform';
  externalId: string | null;
  config: Record<string, string>;
  secrets: Record<string, string>;
};

/** The platform sender only sends the daily report: a number, a token and the template. Everything else is the shop's own business. */
const PLATFORM_SENDER_FIELDS = ['phoneNumberId', 'reportTemplate', 'templateLang', 'accessToken'];
const CACHE_MS = 30_000;
const GRAPH = 'https://graph.facebook.com/v21.0';
const THREADS = 'https://graph.threads.net/v1.0';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Where Meta reaches this API from outside. A plain address, not a secret: the same one the media library already uses. */
export const publicApiBase = () => (process.env.PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

/** Secrets are stored as ONE encrypted JSON string, so a database dump shows nothing and a new provider needs no new column. */
function readSecrets(stored: string | null): Record<string, string> {
  if (!stored) return {};
  try {
    return JSON.parse(decryptSecret(stored)) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * The ids and secrets for every outside service, kept in the database and edited by the people who own them: a shop's owner in the
 * portal (their own WhatsApp number, Facebook Page and Threads account, each from their own Meta app), and the operator in the admin
 * console (the one WhatsApp sender shops without their own may use for notices to their owner).
 *
 * The rules, each with a test:
 *  - Reading a secret back gives "set" and its last four characters, never the value.
 *  - A blank secret means "keep what is there"; clearing is a separate, explicit thing.
 *  - Every change is written to the audit log by field NAME, never value.
 *  - A shop sees and changes only its own connections; one number or Page can belong to only one shop.
 *  - Only the platform sender may stand in for a shop, and only for notices to the shop's own owner, never for anything a customer sees.
 *  - There is no fallback to environment variables (see env-import.ts for the single one-time import).
 */
@Injectable()
export class IntegrationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(IntegrationsService.name);
  private cache = new Map<string, { at: number; value: ResolvedConnection | null }>();

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.importFromEnvironment();
    } catch (error) {
      this.logger.error(`Could not import the WhatsApp sender from the environment: ${(error as Error).message}`);
    }
  }

  // --- reading ----------------------------------------------------------------------------------------------------------

  private toStored(row: { enabled: boolean; externalId?: string | null; config: Prisma.JsonValue; secrets: string | null }): Stored {
    return { enabled: row.enabled, externalId: row.externalId ?? null, config: (row.config ?? {}) as Record<string, string>, secrets: readSecrets(row.secrets) };
  }

  private isComplete(provider: IntegrationProvider, s: Stored) {
    return requiredKeys(provider).every((key) => Boolean(s.config[key] || s.secrets[key]));
  }

  /** The owner's view of one shop's connections: every field, secrets masked. */
  async list(shopId: string) {
    const rows = await this.prisma.shopIntegration.findMany({ where: { shopId } });
    const platform = await this.prisma.platformIntegration.findUnique({ where: { provider: 'WHATSAPP' } });
    const platformSender = platform ? this.isComplete('WHATSAPP', this.toStored(platform)) && platform.enabled : false;
    return {
      encryptionConfigured: secretsKeyConfigured(),
      connections: PROVIDER_KEYS.map((provider) => {
        const row = rows.find((r) => r.provider === provider);
        const stored = row ? this.toStored(row) : { enabled: false, externalId: null, config: {}, secrets: {} };
        return {
          provider,
          label: PROVIDERS[provider].label,
          description: PROVIDERS[provider].description,
          enabled: stored.enabled,
          connected: this.isComplete(provider, stored),
          fields: fieldsOf(provider).map((f) => ({
            key: f.key, label: f.label, kind: f.kind, required: Boolean(f.required), help: f.help, placeholder: f.placeholder ?? null,
            input: f.input ?? 'text',
            value: f.kind === 'config' ? stored.config[f.key] ?? null : null,
            default: f.default ?? null,
            set: Boolean(stored.config[f.key] || stored.secrets[f.key]),
            hint: f.kind === 'secret' ? secretHint(stored.secrets[f.key]) : null,
          })),
          lastCheckedAt: row?.lastCheckedAt ?? null,
          lastError: row?.lastError ?? null,
          tokenExpiresAt: row?.tokenExpiresAt ?? null,
          // WhatsApp only: with no connection of its own, the daily report to the owner goes from the operator's sender.
          ownerNoticesVia: provider === 'WHATSAPP' && !(row && enabledAndComplete(this, provider, stored)) && platformSender ? 'platform' : null,
          webhookConfigured: Boolean(row?.webhookKey),
        };
      }),
    };
  }

  /**
   * The connection a feature may use for a shop, or null ("not connected"). A shop's own connection must be switched on and complete.
   * `allowPlatform` lets the operator's WhatsApp sender stand in, and exists ONLY for notices to the shop's owner.
   */
  async resolve(shopId: string, provider: IntegrationProvider, opts: { allowPlatform?: boolean } = {}): Promise<ResolvedConnection | null> {
    const key = `${shopId}:${provider}:${opts.allowPlatform ? 'p' : 's'}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

    let value: ResolvedConnection | null = null;
    const row = await this.prisma.shopIntegration.findUnique({ where: { shopId_provider: { shopId, provider } } });
    if (row) {
      const s = this.toStored(row);
      if (s.enabled && this.isComplete(provider, s)) value = { source: 'shop', externalId: s.externalId, config: s.config, secrets: s.secrets };
    }
    if (!value && opts.allowPlatform && provider === 'WHATSAPP') {
      const platform = await this.prisma.platformIntegration.findUnique({ where: { provider } });
      if (platform) {
        const s = this.toStored(platform);
        if (s.enabled && this.isComplete(provider, s)) value = { source: 'platform', externalId: s.config.phoneNumberId ?? null, config: s.config, secrets: s.secrets };
      }
    }
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  invalidate(shopId?: string) {
    if (!shopId) { this.cache.clear(); return; }
    for (const key of [...this.cache.keys()]) if (key.startsWith(`${shopId}:`)) this.cache.delete(key);
  }

  // --- writing ----------------------------------------------------------------------------------------------------------

  private merge(provider: IntegrationProvider, current: Stored, input: SecretInput & { enabled?: boolean }) {
    let cleaned;
    try {
      cleaned = cleanInput(provider, input);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
    const config = { ...current.config, ...cleaned.config };
    const secrets = { ...current.secrets, ...cleaned.secrets };
    for (const key of cleaned.clear) { delete config[key]; delete secrets[key]; }
    const changedFields = [...Object.keys(cleaned.config), ...Object.keys(cleaned.secrets), ...cleaned.clear.map((k) => `${k} (cleared)`)];
    const idKey = externalIdKey(provider);
    return { config, secrets, changedFields, externalId: idKey ? config[idKey] ?? null : null };
  }

  /** Saves one shop's connection. Blank secrets are kept; the audit row carries field names only. */
  async save(shopId: string, provider: IntegrationProvider, input: SecretInput & { enabled?: boolean }, actor: Actor) {
    const existing = await this.prisma.shopIntegration.findUnique({ where: { shopId_provider: { shopId, provider } } });
    const merged = this.merge(provider, existing ? this.toStored(existing) : { enabled: false, externalId: null, config: {}, secrets: {} }, input);
    const missing = requiredKeys(provider).filter((k) => !(merged.config[k] || merged.secrets[k])).map((k) => fieldsOf(provider).find((f) => f.key === k)!.label);
    const enabled = input.enabled ?? existing?.enabled ?? false;
    if (enabled && missing.length) throw new BadRequestException(`${PROVIDERS[provider].label} cannot be switched on until ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} filled in.`);

    const data = {
      enabled,
      externalId: merged.externalId,
      config: merged.config as Prisma.InputJsonValue,
      secrets: Object.keys(merged.secrets).length ? encryptSecret(JSON.stringify(merged.secrets)) : null,
      updatedBy: actor.email,
      // Anything that was checked is no longer known to work once its ids or secrets change.
      ...(merged.changedFields.length ? { lastCheckedAt: null, lastError: null } : {}),
    };
    try {
      await this.prisma.shopIntegration.upsert({
        where: { shopId_provider: { shopId, provider } },
        create: { shopId, provider, ...data },
        update: data,
      });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        throw new BadRequestException(`That ${provider === 'WHATSAPP' ? 'WhatsApp number' : provider === 'FACEBOOK' ? 'Facebook Page' : 'Threads account'} is already connected to another shop.`);
      }
      throw error;
    }
    this.invalidate(shopId);
    if (merged.changedFields.length || input.enabled !== undefined) {
      await this.audit({ action: 'integration.updated', shopId, actor, metadata: { provider, fields: merged.changedFields, ...(input.enabled !== undefined ? { enabled: input.enabled } : {}) } });
    }
    return this.list(shopId);
  }

  private async audit(p: { action: string; shopId: string | null; actor: Actor; metadata: Prisma.InputJsonValue }) {
    await this.prisma.adminAuditLog.create({ data: { adminId: p.actor.id ?? null, shopId: p.shopId, action: p.action, metadata: { ...(p.metadata as object), by: p.actor.email, ...(p.actor.impersonatedBy ? { impersonatedBy: p.actor.impersonatedBy } : {}) } } });
  }

  // --- the operator's own sender ----------------------------------------------------------------------------------------

  async listPlatform() {
    const row = await this.prisma.platformIntegration.findUnique({ where: { provider: 'WHATSAPP' } });
    const stored = row ? this.toStored(row) : { enabled: false, externalId: null, config: {}, secrets: {} };
    return {
      encryptionConfigured: secretsKeyConfigured(),
      provider: 'WHATSAPP' as const,
      label: 'WhatsApp sender for owner notices',
      description: 'Shops that have not connected their own WhatsApp number get their daily report from this one. Customers never receive a message from it.',
      enabled: stored.enabled,
      connected: this.isComplete('WHATSAPP', stored),
      fields: fieldsOf('WHATSAPP').filter((f) => PLATFORM_SENDER_FIELDS.includes(f.key)).map((f) => ({
        key: f.key, label: f.label, kind: f.kind, required: Boolean(f.required), help: f.help, placeholder: f.placeholder ?? null,
        value: f.kind === 'config' ? stored.config[f.key] ?? null : null,
        default: f.default ?? null,
        set: Boolean(stored.config[f.key] || stored.secrets[f.key]),
        hint: f.kind === 'secret' ? secretHint(stored.secrets[f.key]) : null,
      })),
      lastCheckedAt: row?.lastCheckedAt ?? null,
      lastError: row?.lastError ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  async savePlatform(input: SecretInput & { enabled?: boolean }, actor: Actor) {
    const existing = await this.prisma.platformIntegration.findUnique({ where: { provider: 'WHATSAPP' } });
    const merged = this.merge('WHATSAPP', existing ? this.toStored(existing) : { enabled: false, externalId: null, config: {}, secrets: {} }, input);
    const complete = requiredKeys('WHATSAPP').every((k) => Boolean(merged.config[k] || merged.secrets[k]));
    const enabled = input.enabled ?? existing?.enabled ?? false;
    if (enabled && !complete) throw new BadRequestException('The sender cannot be switched on until the phone number ID and the access token are filled in.');
    const data = {
      enabled,
      config: merged.config as Prisma.InputJsonValue,
      secrets: Object.keys(merged.secrets).length ? encryptSecret(JSON.stringify(merged.secrets)) : null,
      updatedBy: actor.email,
      ...(merged.changedFields.length ? { lastCheckedAt: null, lastError: null } : {}),
    };
    await this.prisma.platformIntegration.upsert({ where: { provider: 'WHATSAPP' }, create: { provider: 'WHATSAPP', ...data }, update: data });
    this.invalidate();
    await this.audit({ action: 'platform.integration_updated', shopId: null, actor, metadata: { provider: 'WHATSAPP', fields: merged.changedFields, ...(input.enabled !== undefined ? { enabled: input.enabled } : {}) } });
    return this.listPlatform();
  }

  /** One-time copy of the old environment values into the platform sender, so the daily report survives the move. See env-import.ts. */
  async importFromEnvironment(): Promise<boolean> {
    const existing = await this.prisma.platformIntegration.findUnique({ where: { provider: 'WHATSAPP' } });
    if (existing) return false;
    const env = whatsAppFromEnvironment();
    if (!env) return false;
    try {
      await this.prisma.platformIntegration.create({
        data: {
          provider: 'WHATSAPP',
          enabled: true,
          config: { phoneNumberId: env.phoneNumberId, reportTemplate: env.template, templateLang: env.language },
          secrets: encryptSecret(JSON.stringify({ accessToken: env.accessToken })),
          updatedBy: 'imported from the server environment',
        },
      });
    } catch (error) {
      // Both backend slots start together on a rolling deploy; the one that lost the race has nothing to do.
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return false;
      throw error;
    }
    this.logger.log('The WhatsApp sender was copied from the server environment into the platform settings. The environment variables can now be removed.');
    return true;
  }

  // --- webhook addresses ------------------------------------------------------------------------------------------------

  /**
   * A new secret for this shop's webhook address. It is returned once and only its hash is kept, so the address cannot be read back:
   * if it is lost, make another and give Meta the new address.
   */
  async rotateWebhookSecret(shopId: string, provider: IntegrationProvider, actor: Actor): Promise<{ secret: string }> {
    const row = await this.prisma.shopIntegration.findUnique({ where: { shopId_provider: { shopId, provider } } });
    if (!row) throw new NotFoundException(`${PROVIDERS[provider].label} has not been set up yet.`);
    const secret = randomBytes(24).toString('hex');
    await this.prisma.shopIntegration.update({ where: { id: row.id }, data: { webhookKey: sha256(secret), updatedBy: actor.email } });
    await this.audit({ action: 'integration.webhook_rotated', shopId, actor, metadata: { provider } });
    return { secret };
  }

  /** The app secret saved for a connection even if it is switched off, so Meta's signature on an incoming event can still be checked. */
  async appSecretFor(shopId: string, provider: IntegrationProvider): Promise<string | null> {
    const row = await this.prisma.shopIntegration.findUnique({ where: { shopId_provider: { shopId, provider } } });
    return row ? readSecrets(row.secrets).appSecret || null : null;
  }

  /**
   * Gives Meta this shop's webhook address for incoming WhatsApp messages and delivery reports, using the shop's own token. Makes a new
   * secret each time (so the address changes), registers it with the shop's WhatsApp Business Account, and returns the address ONCE so
   * it can also be pasted into Meta's dashboard by hand if the registration is refused. Meta refuses it until the app's "messages" webhook
   * field has been subscribed in the app dashboard, and says so; that message is passed on.
   */
  async connectWhatsappWebhook(shopId: string, actor: Actor): Promise<{ ok: boolean; message: string; url: string; verifyToken: string }> {
    const row = await this.prisma.shopIntegration.findUnique({ where: { shopId_provider: { shopId, provider: 'WHATSAPP' } } });
    if (!row) throw new NotFoundException('WhatsApp has not been set up yet.');
    const s = this.toStored(row);
    if (!s.config.wabaId) throw new BadRequestException('Fill in the WhatsApp Business Account ID and save before connecting incoming messages.');
    if (!s.secrets.accessToken) throw new BadRequestException('Fill in the access token and save before connecting incoming messages.');
    const { secret } = await this.rotateWebhookSecret(shopId, 'WHATSAPP', actor);
    const url = `${publicApiBase()}/whatsapp/webhook/${secret}`;
    try {
      const r = await fetch(`${GRAPH}/${s.config.wabaId}/subscribed_apps`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.secrets.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ override_callback_uri: url, verify_token: secret }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await r.json().catch(() => ({}))) as any;
      if (r.status >= 300) return { ok: false, message: this.failure({ status: r.status, data }), url, verifyToken: secret };
      return { ok: true, message: 'Meta now sends this shop\'s WhatsApp messages and delivery reports to your shop.', url, verifyToken: secret };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Could not reach Meta.', url, verifyToken: secret };
    }
  }

  /** The shop an incoming event belongs to, from the secret in the address it was sent to. A wrong secret finds nothing. */
  async findByWebhookSecret(provider: IntegrationProvider, secret: string) {
    if (!secret || secret.length < 16) return null;
    const row = await this.prisma.shopIntegration.findUnique({ where: { webhookKey: sha256(secret) } });
    if (!row || row.provider !== provider) return null;
    return { shopId: row.shopId, enabled: row.enabled, externalId: row.externalId };
  }

  // --- testing a connection ---------------------------------------------------------------------------------------------

  private async fetchJson(url: string, token: string, via: 'bearer' | 'query'): Promise<{ status: number; data: any }> {
    const target = via === 'query' ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}` : url;
    const response = await fetch(target, { headers: via === 'bearer' ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(20_000) });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  }

  private failure(r: { status: number; data: any }) {
    const e = r.data?.error;
    return [e?.code, e?.error_user_msg || e?.message || `HTTP ${r.status}`].filter((x) => x !== undefined && x !== null).join(': ').slice(0, 300);
  }

  /** Read-only calls only. Returns what Meta says in words the owner can act on, plus a few harmless facts about the account. */
  private async probe(provider: IntegrationProvider, config: Record<string, string>, secrets: Record<string, string>): Promise<{ ok: boolean; message: string; details: Record<string, unknown>; externalId?: string }> {
    try {
      if (provider === 'WHATSAPP') {
        const r = await this.fetchJson(`${GRAPH}/${config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, secrets.accessToken, 'bearer');
        if (r.status >= 300) return { ok: false, message: this.failure(r), details: {} };
        return { ok: true, message: `Connected to ${r.data.display_phone_number ?? 'the number'}${r.data.verified_name ? ` (${r.data.verified_name})` : ''}.`, details: { number: r.data.display_phone_number ?? null, name: r.data.verified_name ?? null, quality: r.data.quality_rating ?? null } };
      }
      if (provider === 'FACEBOOK') {
        const r = await this.fetchJson(`${GRAPH}/${config.pageId}?fields=name,fan_count`, secrets.pageAccessToken, 'bearer');
        if (r.status >= 300) return { ok: false, message: this.failure(r), details: {} };
        const s = await this.fetchJson(`${GRAPH}/${config.pageId}/subscribed_apps`, secrets.pageAccessToken, 'bearer');
        const fields: string[] = s.status < 300 ? (s.data?.data ?? []).flatMap((a: any) => a?.subscribed_fields ?? []) : [];
        return { ok: true, message: `Connected to ${r.data.name ?? 'the Page'}.`, details: { name: r.data.name ?? null, followers: r.data.fan_count ?? null, commentsConnected: fields.includes('feed') } };
      }
      const me = await this.fetchJson(`${THREADS}/me?fields=id,username`, secrets.accessToken, 'query');
      if (me.status >= 300) return { ok: false, message: this.failure(me), details: {} };
      const quota = await this.fetchJson(`${THREADS}/${me.data.id}/threads_publishing_limit?fields=quota_usage,config`, secrets.accessToken, 'query');
      const q = quota.status < 300 ? quota.data?.data?.[0] : null;
      return {
        ok: true, message: `Connected to @${me.data.username ?? 'your account'}.`, externalId: me.data?.id ? String(me.data.id) : undefined,
        details: { username: me.data.username ?? null, postsUsedToday: q?.quota_usage ?? null, postsAllowedPerDay: q?.config?.quota_total ?? null },
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'The connection check failed.', details: {} };
    }
  }

  async test(shopId: string, provider: IntegrationProvider, actor: Actor) {
    const row = await this.prisma.shopIntegration.findUnique({ where: { shopId_provider: { shopId, provider } } });
    if (!row) throw new NotFoundException(`${PROVIDERS[provider].label} has not been set up yet.`);
    const s = this.toStored(row);
    if (!this.isComplete(provider, s)) throw new BadRequestException('Fill in the required fields and save before testing.');
    const result = await this.probe(provider, s.config, s.secrets);
    const update: Prisma.ShopIntegrationUpdateInput = { lastCheckedAt: new Date(), lastError: result.ok ? null : result.message };
    // Threads: the account id is found from the token, so the owner never has to look it up.
    if (result.ok && result.externalId && !s.externalId && provider === 'THREADS') {
      update.externalId = result.externalId;
      update.config = { ...s.config, userId: result.externalId };
    }
    try {
      await this.prisma.shopIntegration.update({ where: { id: row.id }, data: update });
    } catch (error) {
      if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2002') return { ok: false, message: 'That Threads account is already connected to another shop.', details: {} };
      throw error;
    }
    this.invalidate(shopId);
    return { ok: result.ok, message: result.message, details: result.details };
  }

  async testPlatform(actor: Actor) {
    const row = await this.prisma.platformIntegration.findUnique({ where: { provider: 'WHATSAPP' } });
    if (!row) throw new NotFoundException('The WhatsApp sender has not been set up yet.');
    const s = this.toStored(row);
    if (!this.isComplete('WHATSAPP', s)) throw new BadRequestException('Fill in the required fields and save before testing.');
    const result = await this.probe('WHATSAPP', s.config, s.secrets);
    await this.prisma.platformIntegration.update({ where: { provider: 'WHATSAPP' }, data: { lastCheckedAt: new Date(), lastError: result.ok ? null : result.message } });
    return { ok: result.ok, message: result.message, details: result.details };
  }
}

function enabledAndComplete(svc: IntegrationsService, provider: IntegrationProvider, s: Stored) {
  return s.enabled && requiredKeys(provider).every((key) => Boolean(s.config[key] || s.secrets[key]));
}
