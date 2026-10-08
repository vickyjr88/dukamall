import { randomBytes } from 'crypto';
import { PrismaService } from '../../src/prisma/prisma.service';

/** One shared connection for a test file; call close() in afterAll. */
export const prisma = new PrismaService();
export const close = () => prisma.$disconnect();

const created: string[] = [];
const uid = () => randomBytes(4).toString('hex');

/** A throwaway shop (unique slug); everything created under it is removed by cleanup(). */
export async function makeShop(over: Record<string, unknown> = {}) {
  const slug = `it-${uid()}`;
  const shop = await prisma.shop.create({ data: { slug, name: `Test ${slug}`, orderPrefix: 'IT', ...over } });
  created.push(shop.id);
  return shop;
}

export async function makeVariant(shopId: string, priceKes: number, stockOnHand = 10, name = 'Sneaker') {
  const id = uid();
  const product = await prisma.product.create({ data: { shopId, name, slug: `p-${id}` } });
  return prisma.productVariant.create({ data: { productId: product.id, sku: `SKU-${id}`, name: `${name} - 42`, size: '42', priceKes, stockOnHand } });
}

export function makeCustomer(shopId: string, data: { email?: string; phone?: string; firstName?: string; lastName?: string }) {
  return prisma.customer.create({ data: { shopId, firstName: 'Cust', lastName: 'Omer', ...data } });
}

let orderSeq = 0;
export function makeOrder(shopId: string, data: Record<string, unknown>) {
  orderSeq += 1;
  return prisma.order.create({
    data: { shopId, orderNumber: `IT-${uid()}-${orderSeq}`, firstName: 'Guest', lastName: 'Buyer', subtotalKes: 1000, totalKes: 1000, ...data } as any,
  });
}

/** Removes every shop made by makeShop and its data (orders first: they reference customers). */
export async function cleanup() {
  for (const shopId of created.splice(0)) {
    await prisma.cartLead.deleteMany({ where: { shopId } });
    await prisma.order.deleteMany({ where: { shopId } });
    await prisma.shop.delete({ where: { id: shopId } }).catch(() => {});
  }
}
