import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateStorefrontDto, UpdateThemeDto } from './storefront-content.dto';

/** Blank/whitespace-only input means "clear it" -- the column stays null rather than holding an empty string. */
const textOrNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);


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
    return {
      name: shop.name,
      whatsappNumber: shop.whatsappNumber,
      currency: shop.currency,
      // The cart shows the delivery fee before checkout; checkout itself
      // recomputes it (see deliveryFeeFor), so these are for display only.
      deliveryFeeKes: Number(shop.deliveryFeeKes),
      freeDeliveryOverKes: shop.freeDeliveryOverKes === null ? null : Number(shop.freeDeliveryOverKes),
      tagline: shop.tagline,
      announcement: shop.announcement,
      seoDescription: shop.seoDescription,
      contactEmail: shop.contactEmail,
      contactPhone: shop.contactPhone,
      address: shop.address,
      openingHours: shop.openingHours,
      instagramUrl: shop.instagramUrl,
      facebookUrl: shop.facebookUrl,
      tiktokUrl: shop.tiktokUrl,
    };
  }

  /** The portal's "Store info" form: exactly the editable storefront copy, nothing else off the Shop row. */
  async getStorefrontContent(shopId: string) {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
    return {
      name: shop.name,
      tagline: shop.tagline,
      announcement: shop.announcement,
      seoDescription: shop.seoDescription,
      contactEmail: shop.contactEmail,
      contactPhone: shop.contactPhone,
      address: shop.address,
      openingHours: shop.openingHours,
      instagramUrl: shop.instagramUrl,
      facebookUrl: shop.facebookUrl,
      tiktokUrl: shop.tiktokUrl,
    };
  }

  async updateStorefrontContent(shopId: string, dto: UpdateStorefrontDto) {
    // Picked field by field (not spread) so nothing but these columns can be written.
    await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        tagline: textOrNull(dto.tagline),
        announcement: textOrNull(dto.announcement),
        seoDescription: textOrNull(dto.seoDescription),
        contactEmail: textOrNull(dto.contactEmail),
        contactPhone: textOrNull(dto.contactPhone),
        address: textOrNull(dto.address),
        openingHours: textOrNull(dto.openingHours),
        instagramUrl: textOrNull(dto.instagramUrl),
        facebookUrl: textOrNull(dto.facebookUrl),
        tiktokUrl: textOrNull(dto.tiktokUrl),
      },
    });
    return this.getStorefrontContent(shopId);
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
      notificationEmail: shop.notificationEmail,
      deliveryFeeKes: Number(shop.deliveryFeeKes),
      freeDeliveryOverKes: shop.freeDeliveryOverKes === null ? null : Number(shop.freeDeliveryOverKes),
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
      heroEyebrow: null,
      heroHeadline: null,
      heroSubtitle: null,
      heroButtonLabel: null,
      fontPairing: 'fraunces-manrope',
      layoutPreset: 'sharp',
    };
  }

  async updateSettings(shopId: string, data: { whatsappNumber?: string; paystackSecretKey?: string; paystackPublicKey?: string; currency?: string; orderPrefix?: string; notificationEmail?: string | null; deliveryFeeKes?: number; freeDeliveryOverKes?: number | null }) {
    // Blank strings for the Paystack fields mean "leave the existing key
    // alone" (the portal form never round-trips a real key value back, so
    // there's nothing to send except "unchanged" or a genuinely new key) --
    // strip them rather than overwriting a working key with empty string.
    const { paystackSecretKey, paystackPublicKey, notificationEmail, freeDeliveryOverKes, ...rest } = data;
    return this.prisma.shop.update({
      where: { id: shopId },
      data: {
        ...rest,
        // An empty string / null clears these two; undefined leaves them alone.
        ...(notificationEmail !== undefined ? { notificationEmail: notificationEmail || null } : {}),
        ...(freeDeliveryOverKes !== undefined ? { freeDeliveryOverKes: freeDeliveryOverKes || null } : {}),
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

  async updateTheme(shopId: string, dto: UpdateThemeDto) {
    // Whitelisted key by key: the row's id/shopId must never come from a request body.
    const data = {
      ...(dto.primaryColor ? { primaryColor: dto.primaryColor } : {}),
      ...(dto.accentColor ? { accentColor: dto.accentColor } : {}),
      ...(dto.fontPairing ? { fontPairing: dto.fontPairing } : {}),
      ...(dto.layoutPreset ? { layoutPreset: dto.layoutPreset } : {}),
      logoUrl: textOrNull(dto.logoUrl),
      heroImageUrl: textOrNull(dto.heroImageUrl),
      heroEyebrow: textOrNull(dto.heroEyebrow),
      heroHeadline: textOrNull(dto.heroHeadline),
      heroSubtitle: textOrNull(dto.heroSubtitle),
      heroButtonLabel: textOrNull(dto.heroButtonLabel),
    };
    // textOrNull yields undefined for an omitted key, which Prisma leaves untouched.
    return this.prisma.shopTheme.upsert({
      where: { shopId },
      create: { shopId, ...data },
      update: data,
    });
  }
}
