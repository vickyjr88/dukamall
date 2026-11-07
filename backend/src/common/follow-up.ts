import { normalisePhone } from '../portal-customer/portal-customer.service';

/**
 * The WhatsApp message a shop sends to follow up on a cart someone left, or on an order: what was in it, what it comes to,
 * and a link to each product so the customer can look again or pick up where they stopped. Built here rather than in the
 * portal so the wording lives in one place, the product links use the shop's own address, and it is tested.
 *
 * Nothing is sent from here. The result is a wa.me link that opens the conversation with the text ready; the merchant
 * reads it, changes it if they like, and presses send themselves.
 */

export type FollowUpLine = {
  /** What to call it: a product name, or "Product - 128GB / Black / New" for a variant. */
  name: string;
  /** The size or option label when it is not already in the name. */
  label?: string | null;
  quantity: number;
  /** What one costs the customer. */
  unitPrice: number;
  /** The product page on the storefront; absent for a size typed by hand, which has no page. */
  path?: string | null;
};

export type FollowUpKind = 'ABANDONED_CART' | 'WHATSAPP_ORDER' | 'ORDER';

export type FollowUpInput = {
  kind: FollowUpKind;
  shopName: string;
  name?: string | null;
  phone?: string | null;
  lines: FollowUpLine[];
  total: number;
  currency?: string;
  /** ORDER only. */
  orderNumber?: string;
  /** PENDING (unpaid), PAID (being got ready), SHIPPED, DELIVERED; anything else (cancelled) gets no message. */
  orderStatus?: string;
  balance?: number;
  /** The shop's storefront address, no trailing slash. */
  origin: string;
};

export type FollowUp = { phone: string; message: string; url: string };

const MAX_LINES = 8;
/** What a product with no sizes is stored as. It is not something to tell a customer. */
const NO_LABEL = /^(standard|one size|default)$/i;

/** Where a product lives on a shop's storefront. */
export const productPath = (product: { slug: string }) => `/shop/${product.slug}`;

/** The order status a message is worded for, from a shop's two separate fields: payment, and where the goods are. */
export function followUpStatus(order: { status: string; fulfilmentStatus?: string | null }): string {
  if (order.status !== 'PAID') return order.status;
  if (order.fulfilmentStatus === 'DELIVERED') return 'DELIVERED';
  if (order.fulfilmentStatus === 'SHIPPED') return 'SHIPPED';
  return 'PAID';
}

const money = (currency: string, n: number) => `${currency} ${Math.round(n).toLocaleString('en-KE')}`;

/** "Wanjiru Kamau" becomes "Wanjiru"; no name, or a placeholder, becomes "there". */
export function greetingName(name?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first || /^(walk-?in|guest|customer)$/i.test(first)) return 'there';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** The link carries a tag, so a visit that comes back through it shows up in Analytics as WhatsApp follow-up traffic. */
function tagged(origin: string, path: string, campaign: string): string {
  return `${origin}${path}?utm_source=whatsapp&utm_medium=followup&utm_campaign=${campaign}`;
}

function itemsBlock(lines: FollowUpLine[], currency: string, origin: string, campaign: string): string {
  const shown = lines.slice(0, MAX_LINES);
  const seen = new Set<string>();
  const rows = shown.map((line, i) => {
    const label = line.label?.trim() && !NO_LABEL.test(line.label.trim()) ? ` - ${line.label.trim()}` : '';
    const head = `${i + 1}. ${line.name}${label} (x${line.quantity}): ${money(currency, line.unitPrice * line.quantity)}`;
    // One link per product, even when it appears in two sizes.
    if (!line.path || seen.has(line.path)) return head;
    seen.add(line.path);
    return `${head}\n   ${tagged(origin, line.path, campaign)}`;
  });
  const more = lines.length - shown.length;
  if (more > 0) rows.push(`...and ${more} more.`);
  return rows.join('\n');
}

/** The opening and closing lines for each situation, so the middle (the items and the total) reads the same everywhere. */
function wording(input: FollowUpInput, currency: string): { intro: string; outro: string; campaign: string } | null {
  const hi = `Hi ${greetingName(input.name)}, it's ${input.shopName}.`;
  switch (input.kind) {
    case 'ABANDONED_CART':
      return { intro: `${hi} You left these in your cart:`, outro: "Still keen? Reply here and we'll reserve them for you and arrange delivery.", campaign: 'abandoned-cart' };
    case 'WHATSAPP_ORDER':
      return { intro: `${hi} Following up on the order you asked about:`, outro: 'Shall we go ahead? Tell us where to deliver and how you would like to pay.', campaign: 'whatsapp-order' };
    case 'ORDER': {
      const ref = input.orderNumber ? ` ${input.orderNumber}` : '';
      switch (input.orderStatus) {
        case 'PENDING':
          return {
            intro: `${hi} Thank you for your order${ref}:`,
            outro: `${input.balance && input.balance > 0 ? `Balance to pay: ${money(currency, input.balance)}. ` : ''}How would you like to pay? Once it is in we will get your order ready.`,
            campaign: 'order-payment',
          };
        case 'PAID':
          return { intro: `${hi} Your order${ref} is confirmed and we are getting it ready:`, outro: 'We will message you to arrange delivery.', campaign: 'order-update' };
        case 'SHIPPED':
          return { intro: `${hi} Your order${ref} is on its way:`, outro: 'Let us know when it arrives, or if you need anything.', campaign: 'order-update' };
        case 'DELIVERED':
          return {
            intro: `${hi} We hope you are enjoying your order${ref}:`,
            outro: 'If you like it, a photo would make our day. Tell us if you would like to see what is new.',
            campaign: 'order-thanks',
          };
        default:
          // A cancelled order is not something to follow up on.
          return null;
      }
    }
  }
}

/** The follow-up for one cart or order, or null when there is nobody to send it to or nothing to say. */
export function buildFollowUp(input: FollowUpInput): FollowUp | null {
  const phone = normalisePhone(input.phone);
  if (!phone || input.lines.length === 0) return null;
  const currency = input.currency || 'KES';
  const text = wording(input, currency);
  if (!text) return null;

  const message = [
    text.intro,
    '',
    itemsBlock(input.lines, currency, input.origin, text.campaign),
    '',
    `Total: ${money(currency, input.total)}`,
    '',
    text.outro,
  ].join('\n');

  return { phone, message, url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}` };
}
