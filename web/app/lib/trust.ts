import { ShopInfo } from './api';

/**
 * The reasons to buy that are true of *this* shop, worked out from what the shop has set up rather than written once for every shop. A promise
 * that is not kept costs more trust than the page gains, and these shops differ (one takes card payment online, another confirms every order by
 * phone), so nothing here is claimed unless the shop's own settings back it.
 */

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;

/** Short lines for beside the price: three at most, each a few words. */
export function trustChips(info: ShopInfo): string[] {
  const freeOver = Number(info.freeDeliveryOverKes ?? 0);
  const chips = [
    freeOver > 0 ? `Free delivery over ${kes(freeOver)}` : 'We deliver',
    info.onlinePayments ? 'Secure online payment' : 'We confirm every order with you',
  ];
  if (info.whatsappNumber) chips.push('Order on WhatsApp');
  else if (info.address) chips.push('Visit us in store');
  return chips.slice(0, 3);
}

/** The fuller wording for under the buttons (or the "Delivery & help" panel of a luxury style). */
export function assurances(info: ShopInfo): string[] {
  const freeOver = Number(info.freeDeliveryOverKes ?? 0);
  const fee = Number(info.deliveryFeeKes ?? 0);
  const lines: string[] = [];
  if (freeOver > 0) lines.push(`Free delivery on orders over ${kes(freeOver)}${fee > 0 ? `; otherwise ${kes(fee)}` : ''}.`);
  else if (fee > 0) lines.push(`Delivery from ${kes(fee)}.`);
  else lines.push('We deliver: share your address at checkout.');
  lines.push(info.onlinePayments ? 'Pay securely online at checkout.' : 'Nothing to pay at checkout: we confirm your order and arrange payment with you.');
  if (info.address) lines.push(`Visit us: ${info.address}${info.openingHours ? ` (${info.openingHours})` : ''}.`);
  if (info.whatsappNumber) lines.push('Not sure of your size? Message us on WhatsApp.');
  return lines;
}
