import { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The next human-facing order number for a shop ("SHP-00042"). Starts from
 * the order count and steps past any number already taken: counting alone
 * repeats a number once an order has been deleted, and a manual order can now
 * be created alongside a customer's own checkout.
 *
 * Two requests landing in the same instant can still pick the same number --
 * the (shopId, orderNumber) unique constraint then rejects the second rather
 * than letting a duplicate through.
 */
export async function nextOrderNumber(db: Db, shopId: string, prefix: string): Promise<string> {
  const count = await db.order.count({ where: { shopId } });
  for (let n = count + 1; n < count + 1000; n++) {
    const candidate = `${prefix}-${String(n).padStart(5, '0')}`;
    const taken = await db.order.findFirst({ where: { shopId, orderNumber: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new Error('Could not allocate an order number');
}

/**
 * The delivery charge for an order: the shop's flat fee, waived once the
 * amount after any discount reaches its free-delivery threshold. Used by
 * checkout (authoritative) and mirrored for display in the storefront cart.
 */
export function deliveryFeeFor(
  shop: { deliveryFeeKes: Prisma.Decimal | number; freeDeliveryOverKes: Prisma.Decimal | number | null },
  amountAfterDiscount: number,
): number {
  const fee = Number(shop.deliveryFeeKes);
  if (!(fee > 0)) return 0;
  const threshold = shop.freeDeliveryOverKes === null ? 0 : Number(shop.freeDeliveryOverKes);
  if (threshold > 0 && amountAfterDiscount >= threshold) return 0;
  return fee;
}
