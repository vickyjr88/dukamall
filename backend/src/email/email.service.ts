import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret } from '../common/secrets';

/** What an email was for and which shop it concerns, kept in EmailLog. */
export type EmailMeta = { kind?: string; shopId?: string };

export type PlatformSmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
};

/**
 * One SMTP identity for the whole platform (design decision: system email --
 * order confirmations, password resets, staff-invite credentials -- goes out
 * "from" the platform, not from each shop's own mailbox; a shop's Paystack
 * keys are the precedent for a per-shop secret, but email deliverability
 * needs domain/SPF/DKIM setup that isn't something to ask fifty independent
 * stallholders to configure themselves). Config lives in the PlatformSettings
 * singleton row (editable from the admin console) rather than only env vars,
 * so an operator can set or rotate it without a redeploy; env vars
 * (SMTP_HOST/PORT/USER/PASSWORD/FROM/SECURE) are the fallback for local dev
 * or a first deploy before anyone has opened the admin console yet.
 *
 * A transporter is rebuilt on every send rather than cached, since the
 * config can change at any time via the admin console and this platform's
 * email volume (order confirmations, not bulk mail) never makes that a real
 * cost.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private prisma: PrismaService) {}

  async getConfig(): Promise<PlatformSmtpConfig | null> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: 'singleton' } });
    const host = row?.smtpHost || process.env.SMTP_HOST;
    const user = row?.smtpUser || process.env.SMTP_USER;
    const password = decryptSecret(row?.smtpPassword) || process.env.SMTP_PASSWORD;
    const from = row?.smtpFrom || process.env.SMTP_FROM;
    const port = row?.smtpPort ?? (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined);
    const secure = row?.smtpSecure ?? process.env.SMTP_SECURE === 'true';
    if (!host || !user || !password || !from || !port) return null;
    return { host, port, user, password, from, secure };
  }

  /**
   * Never throws -- a merchant's checkout or a staff invite must not fail
   * just because SMTP is unconfigured or a provider hiccups. Every call
   * site treats email as best-effort and logs the outcome instead;
   * see each call site's own comment for what happens to the primary
   * action (invite, order, reset) when this returns false.
   *
   * Every attempt is also recorded in EmailLog (not the body) so an operator
   * can see from the admin console whether mail is actually going out.
   */
  async send(to: string, subject: string, html: string, text?: string, meta: EmailMeta = {}): Promise<boolean> {
    return (await this.sendDetailed(to, subject, html, text, meta)).ok;
  }

  /** Like send(), but says why it failed -- for the admin console's "send test email". */
  async sendDetailed(to: string, subject: string, html: string, text?: string, meta: EmailMeta = {}): Promise<{ ok: boolean; status: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string }> {
    const config = await this.getConfig();
    if (!config) {
      this.logger.warn(`Email not sent (SMTP not configured): "${subject}" to ${to}`);
      const error = 'SMTP is not configured';
      await this.record(to, subject, 'SKIPPED', error, meta);
      return { ok: false, status: 'SKIPPED', error };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.password },
        // Don't hang a request (a checkout, an invite) on an unreachable mail server.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      await transporter.sendMail({ from: config.from, to, subject, html, text: text ?? html.replace(/<[^>]+>/g, ' ') });
      await this.record(to, subject, 'SENT', null, meta);
      return { ok: true, status: 'SENT' };
    } catch (err) {
      const error = (err as Error).message;
      this.logger.error(`Failed to send email "${subject}" to ${to}: ${error}`);
      await this.record(to, subject, 'FAILED', error, meta);
      return { ok: false, status: 'FAILED', error };
    }
  }

  private async record(to: string, subject: string, status: string, error: string | null, meta: EmailMeta) {
    try {
      await this.prisma.emailLog.create({
        data: { to, subject: subject.slice(0, 300), status, error: error?.slice(0, 500) ?? null, kind: meta.kind ?? null, shopId: meta.shopId ?? null },
      });
      // Keep the log from growing forever: now and then, drop what's older than 90 days.
      if (Math.random() < 0.02) {
        await this.prisma.emailLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } });
      }
    } catch (err) {
      // Logging must never be the reason an email (or the request behind it) fails.
      this.logger.warn(`Could not record email log: ${(err as Error).message}`);
    }
  }
}
