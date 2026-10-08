import { normalisePhone } from '../../src/portal-customer/portal-customer.service';

describe('normalisePhone (matching one buyer across different spellings of a number)', () => {
  it.each([
    ['0712345678', '254712345678'],
    ['+254 712 345 678', '254712345678'],
    ['254712345678', '254712345678'],
    ['712345678', '254712345678'],
    ['0112345678', '254112345678'],
    ['(0712) 345-678', '254712345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it('gives every spelling of the same number the same key', () => {
    const keys = new Set(['0722 123 456', '+254722123456', '254722123456', '722123456'].map(normalisePhone));
    expect(keys.size).toBe(1);
  });

  it('keeps different numbers apart', () => {
    expect(normalisePhone('0722123456')).not.toBe(normalisePhone('0722123457'));
  });

  it('returns null for blank or too-short input rather than matching everyone', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone('123')).toBeNull();
    expect(normalisePhone('n/a')).toBeNull();
  });
});
