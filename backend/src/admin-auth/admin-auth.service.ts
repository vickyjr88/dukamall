import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findUserByEmail } from '../common/user-email';
import { decryptSecret, encryptSecret } from '../common/secrets';
import {
  currentStep, generateTotpSecret, hashRecoveryCode, newRecoveryCodes, otpauthUrl, verifyTotp,
} from '../common/totp';

const CHALLENGE_TTL = '5m';
const MAX_2FA_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

type AdminUser = NonNullable<Awaited<ReturnType<PrismaService['user']['findUnique']>>>;

@Injectable()
export class AdminAuthService {
  // Failed second-step attempts per account. In memory, so each backend process
  // keeps its own count -- still enough to make guessing a 6-digit code hopeless
  // (the per-IP request limit sits in front of this as well).
  private failures = new Map<string, { count: number; since: number }>();

  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async login(email: string, password: string) {
    const user = await findUserByEmail(this.prisma, email);
    const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
    // Same "invalid credentials" message whether the email doesn't exist,
    // the password is wrong, or the account simply isn't a super-admin --
    // a distinct "you're not an admin" error would let anyone probe which
    // emails have platform-operator access.
    if (!user || !user.isSuperAdmin || !passwordOk) {
      // A wrong password against a real admin account is worth an operator's
      // attention (someone guessing at it); anything else is just noise and
      // is deliberately not recorded, so the log can't be used to learn which
      // emails are admins or be flooded with junk.
      if (user?.isSuperAdmin) {
        await this.prisma.adminAuditLog.create({ data: { adminId: user.id, shopId: null, action: 'admin.login_failed' } }).catch(() => {});
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Password right, but this account uses a second factor: no session yet,
    // only a short-lived ticket that is good for nothing except the code check.
    if (user.totpEnabledAt) {
      return { requiresTwoFactor: true as const, challengeToken: this.jwtService.sign({ kind: 'admin-2fa', sub: user.id }, { expiresIn: CHALLENGE_TTL }) };
    }
    return this.complete(user);
  }

  /** Second step of login: the authenticator code (or a recovery code) plus the ticket from login(). */
  async verifyTwoFactor(challengeToken: string, code?: string, recoveryCode?: string) {
    let payload: { kind?: string; sub?: string };
    try {
      payload = this.jwtService.verify(challengeToken);
    } catch {
      throw new UnauthorizedException('That sign-in has expired. Please log in again.');
    }
    if (payload.kind !== 'admin-2fa' || !payload.sub) throw new UnauthorizedException('Invalid sign-in');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isSuperAdmin || !user.totpEnabledAt) throw new UnauthorizedException('Invalid sign-in');

    this.assertNotLocked(user.id);
    const ok = await this.checkSecondFactor(user, code, recoveryCode);
    if (!ok) {
      this.recordFailure(user.id);
      await this.prisma.adminAuditLog.create({ data: { adminId: user.id, shopId: null, action: 'admin.login_failed', metadata: { reason: 'bad_second_factor' } } }).catch(() => {});
      throw new UnauthorizedException('That code is not right. Try again.');
    }
    this.failures.delete(user.id);
    return this.complete(user);
  }

  private async complete(user: AdminUser) {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.adminAuditLog.create({ data: { adminId: user.id, shopId: null, action: 'admin.login' } });

    // kind: 'admin' -- a third token space alongside staff (no kind) and
    // customer (kind: 'customer'). No shopId claim at all: unlike a staff
    // token, which is scoped to exactly one shop via UserShop, an admin
    // token's whole point is operating across every shop, so there is
    // nothing to scope it to.
    return {
      access_token: this.jwtService.sign({ kind: 'admin', sub: user.id, email: user.email }),
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    };
  }

  // ---- second-factor checks ----------------------------------------------

  private assertNotLocked(userId: string) {
    const f = this.failures.get(userId);
    if (f && Date.now() - f.since < ATTEMPT_WINDOW_MS && f.count >= MAX_2FA_ATTEMPTS) {
      throw new HttpException('Too many wrong codes. Wait 15 minutes, then log in again.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordFailure(userId: string) {
    const f = this.failures.get(userId);
    if (!f || Date.now() - f.since >= ATTEMPT_WINDOW_MS) this.failures.set(userId, { count: 1, since: Date.now() });
    else f.count++;
  }

  /** True if the authenticator code (or an unused recovery code) is valid; consumes what it uses. */
  private async checkSecondFactor(user: AdminUser, code?: string, recoveryCode?: string): Promise<boolean> {
    if (code) {
      const secret = decryptSecret(user.totpSecret);
      if (!secret) return false;
      const step = verifyTotp(secret, code, user.totpLastStep);
      if (step === null) return false;
      // Remember the step so the same code can't be replayed.
      await this.prisma.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
      return true;
    }
    if (recoveryCode) {
      const hashes = (user.totpRecoveryHashes as string[] | null) ?? [];
      const hash = hashRecoveryCode(recoveryCode);
      if (!hashes.includes(hash)) return false;
      await this.prisma.user.update({ where: { id: user.id }, data: { totpRecoveryHashes: hashes.filter((h) => h !== hash) } });
      return true;
    }
    return false;
  }

  // ---- managing your own two-factor setup ---------------------------------

  async twoFactorStatus(adminId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    return {
      enabled: Boolean(user.totpEnabledAt),
      enabledAt: user.totpEnabledAt,
      recoveryCodesLeft: ((user.totpRecoveryHashes as string[] | null) ?? []).length,
      required: process.env.ADMIN_REQUIRE_2FA === 'true',
    };
  }

  /** Starts enrolment: a fresh secret to put in an authenticator app. Not active until confirmed with a code. */
  async beginSetup(adminId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    if (user.totpEnabledAt) throw new BadRequestException('Two-factor sign-in is already on. Turn it off first to set it up again.');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: adminId }, data: { totpSecret: encryptSecret(secret) } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  /** Confirms enrolment with a first code, switches it on, and returns the one-time recovery codes. */
  async enable(adminId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    if (user.totpEnabledAt) throw new BadRequestException('Two-factor sign-in is already on.');
    const secret = decryptSecret(user.totpSecret);
    if (!secret) throw new BadRequestException('Start the setup first.');
    const step = verifyTotp(secret, code);
    if (step === null) throw new BadRequestException('That code is not right. Check the time on your phone and try again.');

    const codes = newRecoveryCodes();
    await this.prisma.user.update({
      where: { id: adminId },
      data: { totpEnabledAt: new Date(), totpLastStep: step, totpRecoveryHashes: codes.map(hashRecoveryCode) },
    });
    await this.prisma.adminAuditLog.create({ data: { adminId, shopId: null, action: 'admin.2fa_enabled' } });
    return { recoveryCodes: codes };
  }

  async disable(adminId: string, password: string, code?: string, recoveryCode?: string) {
    if (process.env.ADMIN_REQUIRE_2FA === 'true') {
      throw new ForbiddenException('Two-factor sign-in is required for all platform admins and can\'t be turned off.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    if (!user.totpEnabledAt) throw new BadRequestException('Two-factor sign-in is not on.');
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new BadRequestException('Your password is not right.');
    this.assertNotLocked(adminId);
    if (!(await this.checkSecondFactor(user, code, recoveryCode))) {
      this.recordFailure(adminId);
      throw new BadRequestException('That code is not right.');
    }
    await this.prisma.user.update({
      where: { id: adminId },
      data: { totpSecret: null, totpEnabledAt: null, totpRecoveryHashes: Prisma.DbNull, totpLastStep: null },
    });
    await this.prisma.adminAuditLog.create({ data: { adminId, shopId: null, action: 'admin.2fa_disabled' } });
    return { success: true };
  }

  /** A fresh set of recovery codes (the old ones stop working); needs a current authenticator code. */
  async regenerateRecoveryCodes(adminId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    if (!user.totpEnabledAt) throw new BadRequestException('Two-factor sign-in is not on.');
    this.assertNotLocked(adminId);
    const secret = decryptSecret(user.totpSecret);
    const step = secret ? verifyTotp(secret, code, user.totpLastStep) : null;
    if (step === null) { this.recordFailure(adminId); throw new BadRequestException('That code is not right.'); }
    const codes = newRecoveryCodes();
    await this.prisma.user.update({ where: { id: adminId }, data: { totpLastStep: step, totpRecoveryHashes: codes.map(hashRecoveryCode) } });
    return { recoveryCodes: codes };
  }
}
