import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomerAccountService {
  constructor(private prisma: PrismaService) {}

  async getProfile(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true },
    });
    if (!customer) throw new NotFoundException('Account not found');
    return customer;
  }

  listOrders(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      include: { lines: { include: { variant: { include: { product: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { lines: { include: { variant: { include: { product: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  listFavorites(customerId: string) {
    return this.prisma.favorite.findMany({
      where: { customerId },
      include: { product: { include: { variants: { where: { isActive: true }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavorite(shopId: string, customerId: string, productId: string) {
    // A customer can only favorite a product in their own shop -- without
    // this check a forged productId from another shop would silently create
    // a cross-tenant Favorite row (Favorite has no shopId column of its own;
    // it's scoped only through product->shop).
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId } });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.favorite.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { customerId, productId },
      update: {},
    });
  }

  async removeFavorite(customerId: string, productId: string) {
    await this.prisma.favorite.deleteMany({ where: { customerId, productId } });
    return { removed: true };
  }
}
