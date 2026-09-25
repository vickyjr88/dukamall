import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShopService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolves a shop from the host the shopper's browser sent -- either a
   * verified custom domain (nairobigents.co.ke) or the platform's own
   * subdomain (nairobigents.dukamall.app). Called by the storefront's own
   * middleware on every request; see web/middleware.ts.
   */
  async resolveByHost(host: string) {
    const bareHost = host.split(':')[0].toLowerCase();
    const shop = await this.prisma.shop.findFirst({
      where: {
        OR: [
          { customDomain: bareHost },
          { slug: bareHost.split('.')[0] },
        ],
      },
      include: { theme: true },
    });
    if (!shop) throw new NotFoundException('No shop matches this domain');
    return shop;
  }

  async getTheme(shopId: string) {
    const theme = await this.prisma.shopTheme.findUnique({ where: { shopId } });
    // Every shop gets a theme row on creation (see ShopService.create below),
    // so a missing one here means a data-migration gap, not a normal state --
    // still fall back to the platform defaults rather than 500ing a storefront.
    return theme ?? {
      primaryColor: '#2438a8',
      accentColor: '#0f7a40',
      logoUrl: null,
      fontPairing: 'fraunces-manrope',
      layoutPreset: 'sharp',
    };
  }

  async updateTheme(shopId: string, data: Partial<{ primaryColor: string; accentColor: string; logoUrl: string; fontPairing: string; layoutPreset: string }>) {
    // Hex-only: this is injected as raw CSS by the storefront's theme
    // injector (design doc S:2.5) -- anything else is a CSS-injection vector.
    for (const key of ['primaryColor', 'accentColor'] as const) {
      const value = data[key];
      if (value && !/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new Error(`${key} must be a 6-digit hex color`);
      }
    }
    return this.prisma.shopTheme.upsert({
      where: { shopId },
      create: { shopId, ...data },
      update: data,
    });
  }
}
