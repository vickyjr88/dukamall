import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';

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
    const password = row?.smtpPassword || process.env.SMTP_PASSWORD;
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
   */
  async send(to: string, subject: string, html: string, text?: string): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) {
      this.logger.warn(`Email not sent (SMTP not configured): "${subject}" to ${to}`);
      return false;
    }
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.password },
      });
      await transporter.sendMail({ from: config.from, to, subject, html, text: text ?? html.replace(/<[^>]+>/g, ' ') });
      return true;
    } catch (err) {
      this.logger.error(`Failed to send email "${subject}" to ${to}: ${(err as Error).message}`);
      return false;
    }
  }
}
