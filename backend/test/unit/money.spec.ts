import { Prisma } from '@prisma/client';
import { deliveryFeeFor } from '../../src/common/order-helpers';

const shop = (fee: number | string, freeOver: number | string | null) => ({
  deliveryFeeKes: new Prisma.Decimal(fee),
  freeDeliveryOverKes: freeOver === null ? null : new Prisma.Decimal(freeOver),
});

describe('deliveryFeeFor (the delivery charge on every order)', () => {
  it('charges the flat fee below the free-delivery threshold', () => {
    expect(deliveryFeeFor(shop(300, 5000), 3500)).toBe(300);
  });
  it('waives it at exactly the threshold and above', () => {
    expect(deliveryFeeFor(shop(300, 5000), 5000)).toBe(0);
    expect(deliveryFeeFor(shop(300, 5000), 12000)).toBe(0);
  });
  it('is judged on the amount AFTER discount, so a discount can bring the fee back', () => {
    expect(deliveryFeeFor(shop(300, 5000), 4999.99)).toBe(300);
  });
  it('charges always when there is no threshold', () => {
    expect(deliveryFeeFor(shop(250, null), 1_000_000)).toBe(250);
  });
  it('treats a threshold of 0 as "no threshold", not "always free"', () => {
    expect(deliveryFeeFor(shop(250, 0), 100)).toBe(250);
  });
  it('is zero when the shop sets no fee', () => {
    expect(deliveryFeeFor(shop(0, 5000), 10)).toBe(0);
  });
  it('accepts plain numbers as well as Decimals, including decimals in the fee', () => {
    expect(deliveryFeeFor({ deliveryFeeKes: 99.5, freeDeliveryOverKes: 1000 }, 500)).toBe(99.5);
  });
});
