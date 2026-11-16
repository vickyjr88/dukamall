import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutDto } from '../../src/checkout/checkout.dto';
import { CheckoutService } from '../../src/checkout/checkout.service';
import { EVENT_TYPES, cleanEvents } from '../../src/storefront-events/storefront-events.service';

const lines = [{ variantId: 'v1', quantity: 1 }];
const errorsFor = async (body: Record<string, unknown>) => (await validate(plainToInstance(CheckoutDto, { lines, firstName: 'Wanjiku', lastName: 'Kamau', ...body }))).map((e) => e.property);

describe('opening the cart and tapping a phone number are measured', () => {
  it('accepts the two new visit events and still drops anything unknown', () => {
    expect(EVENT_TYPES).toEqual(expect.arrayContaining(['VIEW_CART', 'CALL_CLICK']));
    const cleaned = cleanEvents([{ type: 'VIEW_CART' }, { type: 'CALL_CLICK', detail: 'product-bar', productSlug: 'air-max' }, { type: 'CALL_NOW' }]);
    expect(cleaned.map((e) => e.type)).toEqual(['VIEW_CART', 'CALL_CLICK']);
    expect(cleaned[1]).toMatchObject({ detail: 'product-bar', productSlug: 'air-max' });
  });
});

describe('checkout needs a way to reach the shopper, not an email', () => {
  it('treats a blank email or phone as none, not as a bad address', async () => {
    expect(await errorsFor({ email: '', phone: '0722123456' })).toEqual([]);
    expect(await errorsFor({ email: '   ', phone: '  ' })).toEqual([]);
    expect(await errorsFor({ phone: '0722123456' })).toEqual([]);
    expect(await errorsFor({ email: 'w@example.com' })).toEqual([]);
  });

  it('still refuses an email that is typed but wrong', async () => {
    expect(await errorsFor({ email: 'not-an-email', phone: '0722123456' })).toEqual(['email']);
  });

  it('trims what it keeps, so a padded phone number is stored clean', () => {
    const dto = plainToInstance(CheckoutDto, { lines, firstName: 'A', lastName: 'B', email: '', phone: ' 0722123456 ' });
    expect(dto.phone).toBe('0722123456');
    expect(dto.email).toBeUndefined();
  });

  it('refuses an order with neither a phone nor an email before touching the database', async () => {
    const service = new CheckoutService(null as any, null as any, null as any, null as any, null as any);
    const dto = plainToInstance(CheckoutDto, { lines, firstName: 'A', lastName: 'B', email: '', phone: '' });
    await expect(service.start('shop-1', dto, null)).rejects.toThrow(BadRequestException);
    await expect(service.start('shop-1', dto, null)).rejects.toThrow(/phone number/);
  });
});
