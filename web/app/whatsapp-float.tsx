"use client";

/**
 * Floating WhatsApp button, bottom-right on every storefront page --
 * ported from drip-crm's own whatsapp-float.tsx. A general enquiry, not
 * scoped to any one product (those buttons live on the card/PDP/cart and
 * compose their own item-specific message). Renders nothing when the shop
 * has no WhatsApp number set, same guard every other WhatsApp surface here
 * already uses.
 */

import { useShopInfo } from './lib/shop-info-context';
import { WhatsAppIcon } from './whatsapp-icon';

export function WhatsAppFloat() {
  const shopInfo = useShopInfo();
  const whatsappNumber = (shopInfo?.whatsappNumber || '').replace(/[^\d]/g, '');

  if (!whatsappNumber) return null;

  const href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    `Hi! I'd like to ask about your products.`,
  )}`;

  return (
    <a className="whatsapp-float" href={href} target="_blank" rel="noreferrer" aria-label="Chat with us on WhatsApp">
      <WhatsAppIcon />
    </a>
  );
}
