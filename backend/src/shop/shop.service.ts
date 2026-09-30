import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    // SUSPENDED is the admin center's enforcement point (design intent: a
    // suspension has to actually take the storefront down, not just flip a
    // cosmetic flag nothing reads) -- checked here because every storefront
    // request passes through this resolution first, via web/middleware.ts.
    // Staff/portal access to a suspended shop's own data is deliberately
    // NOT blocked here -- an owner should still be able to log in and see
    // why they were suspended, or fix whatever got them suspended.
    if (shop.status === 'SUSPENDED') {
      throw new ForbiddenException('This shop is currently unavailable.');
    }
    return shop;
  }

  // The handful of shop fields the storefront itself needs client-side (the
  // WhatsApp button, page titles) -- deliberately not the full Shop row,
  // which also carries paystackSecretKey and other server-only values that
  // must never reach the browser.
  async getPublicInfo(shopId: string) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    return { name: shop.name, whatsappNumber: shop.whatsappNumber, currency: shop.currency };
  }

  // The portal's own settings read -- separate from getPublicInfo above
  // (which the storefront also calls and must never carry payment-key
  // material). Paystack keys are reported only as booleans: a merchant
  // needs to know "is this configured," never the key value back, the same
  // "never re-display a secret once set" rule the admin console's own
  // shop-detail view already follows.
  async getPortalSettings(shopId: string) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    return {
      whatsappNumber: shop.whatsappNumber,
      currency: shop.currency,
      orderPrefix: shop.orderPrefix,
      paystackSecretKeySet: Boolean(shop.paystackSecretKey),
      paystackPublicKeySet: Boolean(shop.paystackPublicKey),
    };
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
      heroImageUrl: null,
      fontPairing: 'fraunces-manrope',
      layoutPreset: 'sharp',
    };
  }

  async updateSettings(shopId: string, data: { whatsappNumber?: string; paystackSecretKey?: string; paystackPublicKey?: string; currency?: string; orderPrefix?: string }) {
    // Blank strings for the Paystack fields mean "leave the existing key
    // alone" (the portal form never round-trips a real key value back, so
    // there's nothing to send except "unchanged" or a genuinely new key) --
    // strip them rather than overwriting a working key with empty string.
    const { paystackSecretKey, paystackPublicKey, ...rest } = data;
    return this.prisma.shop.update({
      where: { id: shopId },
      data: {
        ...rest,
        ...(paystackSecretKey ? { paystackSecretKey } : {}),
        ...(paystackPublicKey ? { paystackPublicKey } : {}),
      },
    });
  }

  // Kept here, not just in the web app's font-pairings.ts, so a portal
  // themeOptions() call and the storefront's ThemeInjector can never list
  // two different sets of choices -- one source of truth for what "Tier 1
  // theming" actually offers.
  themeOptions() {
    return {
      fontPairings: [
        { key: 'fraunces-manrope', label: 'Fraunces + Manrope (editorial serif)' },
        { key: 'playfair-inter', label: 'Playfair Display + Inter (classic elegant)' },
        { key: 'poppins-only', label: 'Poppins (modern, rounded)' },
        { key: 'dm-serif-work', label: 'DM Serif + Work Sans (warm editorial)' },
        { key: 'unbounded-sans', label: 'Unbounded + Sora (bold contemporary)' },
      ],
      layoutPresets: [
        { key: 'sharp', label: 'Sharp (square corners, no rounding)' },
        { key: 'soft', label: 'Soft (rounded corners)' },
      ],
    };
  }

  async updateTheme(shopId: string, data: Partial<{ primaryColor: string; accentColor: string; logoUrl: string; heroImageUrl: string; fontPairing: string; layoutPreset: string }>) {
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
