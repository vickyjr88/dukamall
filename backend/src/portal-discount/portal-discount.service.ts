import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Discount, DiscountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateDiscountInput = {
  code: string;
  type: DiscountType;
  percentOff?: number;
  amountOffKes?: number;
  minOrderKes?: number;
  expiresAt?: Date | null;
  usageLimit?: number | null;
};

@Injectable()
export class PortalDiscountService {
  constructor(private prisma: PrismaService) {}

  list(shopId: string) {
    return this.prisma.discount.findMany({
      where: { shopId },
      include: { _count: { select: { redemptions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(shopId: string, input: CreateDiscountInput) {
    this.validateShape(input);
    const code = input.code.trim().toUpperCase();
    if (!code) throw new BadRequestException('Code is required');

    const existing = await this.prisma.discount.findUnique({ where: { shopId_code: { shopId, code } } });
    if (existing) throw new BadRequestException('A discount with this code already exists');

    return this.prisma.discount.create({
      data: {
        shopId,
        code,
        type: input.type,
        percentOff: input.type === 'PERCENT' ? input.percentOff : null,
        amountOffKes: input.type === 'FIXED_AMOUNT' ? input.amountOffKes : null,
        minOrderKes: input.minOrderKes ?? null,
        expiresAt: input.expiresAt ?? null,
        usageLimit: input.usageLimit ?? null,
      },
    });
  }

  async setActive(shopId: string, discountId: string, isActive: boolean) {
    const discount = await this.prisma.discount.findFirst({ where: { id: discountId, shopId } });
    if (!discount) throw new NotFoundException('Discount not found');
    return this.prisma.discount.update({ where: { id: discountId }, data: { isActive } });
  }

  async remove(shopId: string, discountId: string) {
    const discount = await this.prisma.discount.findFirst({ where: { id: discountId, shopId } });
    if (!discount) throw new NotFoundException('Discount not found');
    await this.prisma.discount.delete({ where: { id: discountId } });
    return { success: true };
  }

  private validateShape(input: CreateDiscountInput) {
    if (input.type === 'PERCENT') {
      if (!input.percentOff || input.percentOff < 1 || input.percentOff > 100) {
        throw new BadRequestException('percentOff must be between 1 and 100');
      }
    } else if (input.type === 'FIXED_AMOUNT') {
      if (!input.amountOffKes || input.amountOffKes <= 0) {
        throw new BadRequestException('amountOffKes must be greater than 0');
      }
    }
  }

  /**
   * Shared by both the storefront's "apply code" preview and
   * CheckoutService.start -- one place decides whether a code is usable and
   * how much it takes off a given subtotal, so a code that looks valid in
   * the cart preview can never then be silently rejected or computed
   * differently at actual checkout.
   */
  async resolveForCheckout(shopId: string, rawCode: string, subtotalKes: number): Promise<{ discount: Discount; discountKes: number }> {
    const code = rawCode.trim().toUpperCase();
    const discount = await this.prisma.discount.findUnique({ where: { shopId_code: { shopId, code } } });
    if (!discount || !discount.isActive) {
      throw new BadRequestException('This discount code is not valid');
    }
    if (discount.expiresAt && discount.expiresAt < new Date()) {
      throw new BadRequestException('This discount code has expired');
    }
    if (discount.minOrderKes && subtotalKes < Number(discount.minOrderKes)) {
      throw new BadRequestException(`This code requires a minimum order of KES ${Number(discount.minOrderKes).toLocaleString()}`);
    }
    if (discount.usageLimit !== null) {
      const redemptionCount = await this.prisma.discountRedemption.count({ where: { discountId: discount.id } });
      if (redemptionCount >= discount.usageLimit) {
        throw new BadRequestException('This discount code has reached its usage limit');
      }
    }

    const discountKes = discount.type === 'PERCENT'
      ? Math.round(subtotalKes * (discount.percentOff! / 100))
      : Math.min(subtotalKes, Number(discount.amountOffKes));

    return { discount, discountKes };
  }
}
