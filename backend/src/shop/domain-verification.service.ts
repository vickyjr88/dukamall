import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { resolveTxt } from 'dns/promises';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Custom-domain connection, design doc Phase 3 ("DNS instructions + a
 * domain-verification step"). A shop owner can type in ANY domain in the
 * request form below -- including one they don't own -- so nothing here
 * ever treats a requested domain as real until a DNS TXT record proves
 * control of it. Skipping that check would let one shop claim
 * "competitor.com" and either take over that business's traffic (if DNS
 * later points there) or just deny it to the real owner forever, since
 * customDomain is @unique.
 *
 * Flow:
 *   1. requestDomain() -- stores the domain as PENDING with a random token,
 *      touches nothing DNS-resolvable yet.
 *   2. Shop owner adds a TXT record at _shops-platform-verify.<domain>
 *      containing that token (their own DNS, their own proof of control).
 *   3. verifyDomain() -- looks up that TXT record; only on an exact token
 *      match does the domain get copied into Shop.customDomain, the field
 *      resolveByHost() actually trusts for routing.
 */
@Injectable()
export class DomainVerificationService {
  private readonly logger = new Logger(DomainVerificationService.name);

  constructor(private prisma: PrismaService) {}

  private normalizeDomain(input: string): string {
    const domain = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      throw new BadRequestException('That doesn\'t look like a valid domain (e.g. nairobigents.co.ke)');
    }
    return domain;
  }

  async requestDomain(shopId: string, rawDomain: string) {
    const domain = this.normalizeDomain(rawDomain);

    const existing = await this.prisma.shop.findFirst({
      where: { OR: [{ customDomain: domain }, { pendingDomain: domain }], NOT: { id: shopId } },
    });
    if (existing) {
      throw new BadRequestException('This domain is already connected to another shop');
    }

    const token = randomBytes(16).toString('hex');
    await this.prisma.shop.update({
      where: { id: shopId },
      data: { pendingDomain: domain, domainVerificationToken: token, domainVerifiedAt: null },
    });

    return {
      domain,
      recordType: 'TXT',
      recordName: `_shops-platform-verify.${domain}`,
      recordValue: token,
      instructions: `Add a TXT record at _shops-platform-verify.${domain} with the value shown above, then click Verify. DNS changes can take up to a few hours to propagate.`,
    };
  }

  async verifyDomain(shopId: string) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    if (!shop.pendingDomain || !shop.domainVerificationToken) {
      throw new BadRequestException('No domain is pending verification for this shop');
    }

    const recordName = `_shops-platform-verify.${shop.pendingDomain}`;
    let records: string[][];
    try {
      records = await resolveTxt(recordName);
    } catch (err) {
      this.logger.warn(`TXT lookup failed for ${recordName}: ${(err as Error).message}`);
      throw new BadRequestException('Could not find the verification TXT record yet. DNS changes can take time to propagate -- try again shortly.');
    }

    const found = records.some((chunks) => chunks.join('') === shop.domainVerificationToken);
    if (!found) {
      throw new BadRequestException('The TXT record was found but did not match the expected value. Double-check what you added.');
    }

    return this.prisma.shop.update({
      where: { id: shopId },
      data: {
        customDomain: shop.pendingDomain,
        pendingDomain: null,
        domainVerificationToken: null,
        domainVerifiedAt: new Date(),
      },
    });
  }

  async getDomainStatus(shopId: string) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    return {
      customDomain: shop.customDomain,
      pendingDomain: shop.pendingDomain,
      domainVerificationToken: shop.domainVerificationToken,
      domainVerifiedAt: shop.domainVerifiedAt,
    };
  }

  async disconnectDomain(shopId: string) {
    return this.prisma.shop.update({
      where: { id: shopId },
      data: { customDomain: null, pendingDomain: null, domainVerificationToken: null, domainVerifiedAt: null },
    });
  }
}
