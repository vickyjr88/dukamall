import { Injectable } from '@nestjs/common';
import * as os from 'os';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { EmailService } from '../email/email.service';
import { isEncrypted, secretsKeyConfigured } from '../common/secrets';
import { adminTwoFactorEnabled, adminTwoFactorRequired } from '../common/feature-flags';

export type HealthStatus = 'ok' | 'warn' | 'fail';
export type HealthCheck = { key: string; label: string; status: HealthStatus; summary: string; details?: Record<string, string | number | boolean | null> };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * One page that answers "is the platform healthy?" for an operator: the things
 * that fail quietly (mail not sending, payments not being confirmed, secrets
 * stored in the clear, trials left to run on forever) alongside the obvious
 * ones (database, file storage). Every check is independent and never throws:
 * a broken dependency becomes a red row, not a failed page.
 */
@Injectable()
export class PlatformHealthService {
  constructor(private prisma: PrismaService, private media: MediaService, private email: EmailService) {}

  async check() {
    const checks = await Promise.all([
      this.database(), this.storage(), this.mail(), this.payments(), this.secrets(), this.adminSecurity(), this.trials(),
    ].map((p, i) => p.catch((err: Error): HealthCheck => ({ key: `check-${i}`, label: 'Check', status: 'fail', summary: `The check itself failed: ${err.message}` }))));

    const overall: HealthStatus = checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok';
    return { overall, checkedAt: new Date().toISOString(), checks, runtime: this.runtime() };
  }

  private async database(): Promise<HealthCheck> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const ms = Date.now() - started;
      // Migrations that started but never finished mean a deploy went wrong halfway.
      const unfinished = await this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
      const latest = await this.prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
      const stuck = Number(unfinished[0]?.n ?? 0);
      return {
        key: 'database', label: 'Database',
        status: stuck > 0 ? 'fail' : ms > 500 ? 'warn' : 'ok',
        summary: stuck > 0 ? `${stuck} migration(s) did not finish -- a deploy may have stopped halfway` : `Reachable (${ms} ms)`,
        details: { responseMs: ms, latestMigration: latest[0]?.migration_name ?? null },
      };
    } catch (err) {
      return { key: 'database', label: 'Database', status: 'fail', summary: `Not reachable: ${(err as Error).message}` };
    }
  }

  private async storage(): Promise<HealthCheck> {
    const r = await this.media.ping();
    return {
      key: 'storage', label: 'File storage (images)', status: r.ok ? (r.ms > 1500 ? 'warn' : 'ok') : 'fail',
      summary: r.ok ? `Reachable (${r.ms} ms)` : `Not reachable: ${r.error}`,
      details: { responseMs: r.ms },
    };
  }

  private async mail(): Promise<HealthCheck> {
    const config = await this.email.getConfig();
    const since = new Date(Date.now() - DAY_MS);
    const [groups, lastSent] = await Promise.all([
      this.prisma.emailLog.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.emailLog.findFirst({ where: { status: 'SENT' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
    const sent = n('SENT'); const failed = n('FAILED'); const skipped = n('SKIPPED');
    const details = { sentLast24h: sent, failedLast24h: failed, notSentLast24h: skipped, lastSuccessfulSend: lastSent?.createdAt.toISOString() ?? null };
    if (!config) {
      return { key: 'mail', label: 'Email', status: 'fail', summary: 'Email (SMTP) is not configured: order alerts, invites and password resets are not being sent', details };
    }
    if (failed > 0 && sent === 0) return { key: 'mail', label: 'Email', status: 'fail', summary: `Every email in the last 24 hours failed (${failed}). Check the email log for the error`, details };
    if (failed > 0) return { key: 'mail', label: 'Email', status: 'warn', summary: `${failed} of ${sent + failed} emails failed in the last 24 hours`, details };
    return { key: 'mail', label: 'Email', status: 'ok', summary: sent ? `${sent} sent in the last 24 hours, none failed` : 'Configured; nothing sent in the last 24 hours', details };
  }

  /** Orders waiting on an online payment that never got confirmed -- the sign of a missing webhook. */
  private async payments(): Promise<HealthCheck> {
    const cutoff = new Date(Date.now() - HOUR_MS);
    const stuck = await this.prisma.order.findMany({
      where: { status: 'PENDING', paystackReference: { not: null }, createdAt: { lt: cutoff, gt: new Date(Date.now() - 7 * DAY_MS) } },
      select: { shopId: true },
    });
    const byShop = new Map<string, number>();
    for (const o of stuck) byShop.set(o.shopId, (byShop.get(o.shopId) ?? 0) + 1);
    const shops = byShop.size ? await this.prisma.shop.findMany({ where: { id: { in: Array.from(byShop.keys()) } }, select: { id: true, name: true } }) : [];
    const worst = shops.map((s) => `${s.name} (${byShop.get(s.id)})`).slice(0, 5).join(', ');
    return {
      key: 'payments', label: 'Online payments',
      status: stuck.length === 0 ? 'ok' : stuck.length >= 10 ? 'fail' : 'warn',
      summary: stuck.length === 0
        ? 'No online orders stuck waiting for payment confirmation'
        : `${stuck.length} online order(s) from the last 7 days started paying over an hour ago and were never confirmed. Likely a missing Paystack webhook, or abandoned checkouts. ${worst}`,
      details: { stuckOrders: stuck.length, shopsAffected: byShop.size },
    };
  }

  private async secrets(): Promise<HealthCheck> {
    const configured = secretsKeyConfigured();
    const [shops, settings, users] = await Promise.all([
      this.prisma.shop.findMany({ where: { paystackSecretKey: { not: null } }, select: { paystackSecretKey: true } }),
      this.prisma.platformSettings.findUnique({ where: { id: 'singleton' }, select: { smtpPassword: true } }),
      this.prisma.user.findMany({ where: { totpSecret: { not: null } }, select: { totpSecret: true } }),
    ]);
    const all = [...shops.map((s) => s.paystackSecretKey), settings?.smtpPassword, ...users.map((u) => u.totpSecret)].filter((v): v is string => Boolean(v));
    const plaintext = all.filter((v) => !isEncrypted(v)).length;
    const details = { keyConfigured: configured, storedSecrets: all.length, storedAsPlaintext: plaintext };
    if (!configured) return { key: 'secrets', label: 'Secret encryption', status: 'fail', summary: `SECRETS_ENCRYPTION_KEY is not set: ${all.length} stored secret(s) are unencrypted`, details };
    if (plaintext > 0) return { key: 'secrets', label: 'Secret encryption', status: 'warn', summary: `${plaintext} secret(s) are still stored unencrypted; they are encrypted on the next restart`, details };
    return { key: 'secrets', label: 'Secret encryption', status: 'ok', summary: `Key configured; all ${all.length} stored secret(s) are encrypted`, details };
  }

  private async adminSecurity(): Promise<HealthCheck> {
    const admins = await this.prisma.user.findMany({ where: { isSuperAdmin: true }, select: { totpEnabledAt: true } });
    const withTwoFactor = admins.filter((a) => a.totpEnabledAt).length;
    const enabled = adminTwoFactorEnabled();
    const required = adminTwoFactorRequired();
    const apiDocs = process.env.ENABLE_API_DOCS === 'true';
    const details = { admins: admins.length, twoFactorFeatureOn: enabled, adminsWithTwoFactor: withTwoFactor, twoFactorRequired: required, apiDocsPublic: apiDocs };
    const without = admins.length - withTwoFactor;
    if (apiDocs) return { key: 'security', label: 'Admin security', status: 'warn', summary: 'The API documentation page (/api-docs) is publicly enabled', details };
    // Switched off on purpose (ADMIN_2FA_ENABLED): say so, rather than nag about it.
    if (!enabled) return { key: 'security', label: 'Admin security', status: 'ok', summary: 'Two-factor sign-in is switched off (ADMIN_2FA_ENABLED); admins sign in with a password only', details };
    if (without > 0) return { key: 'security', label: 'Admin security', status: 'warn', summary: `${without} of ${admins.length} platform admin(s) do not use two-factor sign-in${required ? ' (required, so they are locked to setup)' : ''}`, details };
    return { key: 'security', label: 'Admin security', status: 'ok', summary: `All ${admins.length} platform admin(s) use two-factor sign-in`, details };
  }

  private async trials(): Promise<HealthCheck> {
    const now = new Date();
    const [policy, expiredOpen, undated, lastReminder] = await Promise.all([
      this.prisma.platformSettings.findUnique({ where: { id: 'singleton' } }),
      this.prisma.shop.count({ where: { billingPlan: 'TRIAL', status: { not: 'SUSPENDED' }, trialEndsAt: { lt: now } } }),
      this.prisma.shop.count({ where: { billingPlan: 'TRIAL', status: { not: 'SUSPENDED' }, trialEndsAt: null } }),
      this.prisma.trialReminder.findFirst({ orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
    ]);
    const details = {
      trialsPastEndDate: expiredOpen, shopsOnTrialWithNoEndDate: undated,
      autoSuspend: policy?.suspendExpiredTrials ?? false, lastReminderSent: lastReminder?.sentAt.toISOString() ?? null,
    };
    if (expiredOpen > 0) return { key: 'trials', label: 'Trials', status: 'warn', summary: `${expiredOpen} shop(s) are past their trial end date and still open${policy?.suspendExpiredTrials ? ' (they close after the grace period)' : ''}`, details };
    if (undated > 0) return { key: 'trials', label: 'Trials', status: 'warn', summary: `${undated} shop(s) on a trial have no end date, so no reminders or limits apply to them`, details };
    return { key: 'trials', label: 'Trials', status: 'ok', summary: 'Every trial has an end date and none are overdue', details };
  }

  private runtime() {
    const mem = process.memoryUsage();
    return {
      // With two backend slots behind nginx, this says which one answered.
      host: os.hostname(),
      nodeVersion: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(mem.rss / 1024 / 1024),
      environment: process.env.NODE_ENV ?? 'unset',
    };
  }
}
