"use client";

/**
 * Someone tapping a phone number. Most of these shops' sales start in a chat or a call, so a call tap is a conversion in its own right: recorded
 * in the shop's own visit record (Analytics shows it beside WhatsApp taps) and passed to the ad pixels as a Contact, so campaigns can be judged and
 * optimised on it. WhatsApp taps already take the same two routes.
 *
 * Wired once for every tel: link on the site (see StorefrontTracker), not button by button, so a link added next month is counted too.
 * A link can say where it sits with data-source="product-bar"; otherwise it is "site".
 */

/** The tel: link a click landed on, if it did. Pure, so it can be reasoned about without a browser. */
export function telLinkOf(target: EventTarget | null): { source: string } | null {
  const element = typeof Element !== 'undefined' && target instanceof Element ? target : null;
  const link = element?.closest?.('a[href^="tel:" i]');
  if (!link) return null;
  return { source: link.getAttribute('data-source')?.trim().slice(0, 40) || 'site' };
}

/** "/shop/air-max" is the product "air-max"; any other page has none. */
export function productSlugOfPath(pathname: string): string | null {
  const match = /^\/shop\/([^/?#]+)/.exec(pathname);
  return match ? decodeURIComponent(match[1]).slice(0, 120) : null;
}

/** A phone number as a tel: address: digits and a leading +, nothing a dialler would choke on. */
export function telHref(phone: string | null | undefined): string | null {
  const cleaned = (phone ?? '').trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  return cleaned.replace(/\D/g, '').length >= 7 ? `tel:${cleaned}` : null;
}
