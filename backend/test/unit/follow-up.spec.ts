import { buildFollowUp, followUpStatus, greetingName, productPath } from '../../src/common/follow-up';
import { leadFollowUp } from '../../src/cart-lead/cart-lead.service';
import { orderFollowUp } from '../../src/portal-order/portal-order.service';

const origin = 'https://nairobigents.co.ke';
const base = { shopName: 'Nairobi Gents', origin };
const roma = { name: 'Puma Roma Triple Black', label: '42', quantity: 1, unitPrice: 4200, path: '/shop/puma-roma' };
const decode = (url: string) => decodeURIComponent(url.split('?text=')[1]);

describe('the WhatsApp follow-up message', () => {
  it('names the shop, lists what was left with a tagged link to each product, and gives the total', () => {
    const f = buildFollowUp({ ...base, kind: 'ABANDONED_CART', name: 'wanjiru kamau', phone: '0722 111 222', total: 8400, lines: [roma, { ...roma, name: 'Air Max Ultra', label: '43', path: '/shop/air-max' }] })!;
    expect(f.phone).toBe('254722111222');
    expect(f.url.startsWith('https://wa.me/254722111222?text=')).toBe(true);
    expect(decode(f.url)).toBe([
      "Hi Wanjiru, it's Nairobi Gents. You left these in your cart:",
      '',
      '1. Puma Roma Triple Black - 42 (x1): KES 4,200',
      '   https://nairobigents.co.ke/shop/puma-roma?utm_source=whatsapp&utm_medium=followup&utm_campaign=abandoned-cart',
      '2. Air Max Ultra - 43 (x1): KES 4,200',
      '   https://nairobigents.co.ke/shop/air-max?utm_source=whatsapp&utm_medium=followup&utm_campaign=abandoned-cart',
      '',
      'Total: KES 8,400',
      '',
      "Still keen? Reply here and we'll reserve them for you and arrange delivery.",
    ].join('\n'));
  });

  it('links a product once, skips a link for a size typed by hand, and does not give a sizeless product a size', () => {
    const f = buildFollowUp({
      ...base, kind: 'ABANDONED_CART', name: 'A', phone: '0722111222', total: 100, currency: 'KES',
      lines: [roma, { ...roma, label: '43' }, { name: 'Custom', label: '47', quantity: 1, unitPrice: 4200, path: null }, { name: 'Watch', label: 'Standard', quantity: 1, unitPrice: 4500, path: '/shop/watch' }],
    })!;
    expect(f.message.split('\n').filter((l) => l.includes('nairobigents.co.ke')).length).toBe(2);
    expect(f.message).toContain('3. Custom - 47 (x1): KES 4,200\n');
    expect(f.message).toContain('4. Watch (x1): KES 4,500');
  });

  it('cuts a long cart short and says how many more there are', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `Pair ${i}`, quantity: 1, unitPrice: 1000, path: `/shop/p-${i}` }));
    const f = buildFollowUp({ ...base, kind: 'ABANDONED_CART', name: 'A', phone: '0722111222', total: 11000, lines: many })!;
    expect(f.message).toContain('8. Pair 7');
    expect(f.message).not.toContain('9. Pair 8');
    expect(f.message).toContain('...and 3 more.');
  });

  it('words an order for where it has got to, and asks for the balance while it is unpaid', () => {
    const order = { ...base, kind: 'ORDER' as const, name: 'Brian', phone: '0733444555', total: 4200, lines: [roma], orderNumber: 'NG-0042' };
    const unpaid = decode(buildFollowUp({ ...order, orderStatus: 'PENDING', balance: 4200 })!.url);
    expect(unpaid).toContain('Thank you for your order NG-0042:');
    expect(unpaid).toContain('Balance to pay: KES 4,200. How would you like to pay?');
    expect(decode(buildFollowUp({ ...order, orderStatus: 'PAID' })!.url)).toContain('confirmed and we are getting it ready');
    expect(decode(buildFollowUp({ ...order, orderStatus: 'SHIPPED' })!.url)).toContain('is on its way');
    expect(decode(buildFollowUp({ ...order, orderStatus: 'DELIVERED' })!.url)).toContain('We hope you are enjoying your order NG-0042');
  });

  it('has nothing to send without a usable phone or items, or for a cancelled order', () => {
    const ok = { ...base, kind: 'ABANDONED_CART' as const, name: 'A', phone: '0722111222', total: 1, lines: [roma] };
    expect(buildFollowUp(ok)).not.toBeNull();
    expect(buildFollowUp({ ...ok, phone: null })).toBeNull();
    expect(buildFollowUp({ ...ok, phone: 'n/a' })).toBeNull();
    expect(buildFollowUp({ ...ok, lines: [] })).toBeNull();
    expect(buildFollowUp({ ...ok, kind: 'ORDER', orderStatus: 'CANCELLED' })).toBeNull();
  });

  it('greets by first name, and says "there" for a placeholder', () => {
    expect(greetingName('wanjiru kamau')).toBe('Wanjiru');
    expect(greetingName('Walk-in')).toBe('there');
    expect(greetingName(null)).toBe('there');
  });

  it('files a product at the shop\'s storefront page', () => {
    expect(productPath({ slug: 'iphone-13' })).toBe('/shop/iphone-13');
  });
});

describe('a shop\'s own two order fields become one message status', () => {
  it.each([
    [{ status: 'PENDING', fulfilmentStatus: 'UNFULFILLED' }, 'PENDING'],
    [{ status: 'PAID', fulfilmentStatus: 'UNFULFILLED' }, 'PAID'],
    [{ status: 'PAID', fulfilmentStatus: 'SHIPPED' }, 'SHIPPED'],
    [{ status: 'PAID', fulfilmentStatus: 'DELIVERED' }, 'DELIVERED'],
    [{ status: 'CANCELLED', fulfilmentStatus: 'UNFULFILLED' }, 'CANCELLED'],
  ])('%j -> %s', (order, expected) => expect(followUpStatus(order)).toBe(expected));
});

describe('follow-ups for leads and orders', () => {
  const shop = { name: 'Phone Hub', currency: 'KES' };
  const lead = (over: any = {}) => ({
    source: 'ABANDONED_CART', status: 'NEW', customerName: 'Wanjiru', customerPhone: '0722111222',
    lines: [{ name: 'iPhone 13', size: '128GB / Black / New', quantity: 1, priceKes: '78000.00', variant: { product: { slug: 'iphone-13' } } }, { name: 'Case', size: 'M', quantity: 1, priceKes: 500, variant: null }],
    ...over,
  });

  it('a lead gets one while it is open, with product links for the lines that have a page', () => {
    const f = leadFollowUp(lead(), shop, 'https://phonehub.shops.test')!;
    expect(f.message).toContain("it's Phone Hub.");
    expect(f.message).toContain('1. iPhone 13 - 128GB / Black / New (x1): KES 78,000');
    expect(f.message).toContain('https://phonehub.shops.test/shop/iphone-13?utm_source=whatsapp');
    expect(f.message).toContain('Total: KES 78,500');
    expect(leadFollowUp(lead({ status: 'CONTACTED' }), shop, origin)).not.toBeNull();
    expect(leadFollowUp(lead({ status: 'CONVERTED' }), shop, origin)).toBeNull();
    expect(leadFollowUp(lead({ status: 'LOST' }), shop, origin)).toBeNull();
    expect(leadFollowUp(lead({ customerPhone: null }), shop, origin)).toBeNull();
    expect(leadFollowUp(lead({ source: 'WHATSAPP_ORDER' }), shop, origin)!.message).toContain('Following up on the order you asked about');
  });

  it('an order uses its variant names and is worded by payment and delivery', () => {
    const order = (over: any = {}) => ({
      orderNumber: 'PH-7', status: 'PENDING', fulfilmentStatus: 'UNFULFILLED', firstName: 'Brian', phone: '+254733444555', totalKes: '78000.00',
      lines: [{ quantity: 1, priceKes: '78000.00', variant: { name: 'iPhone 13 - 128GB / Black / New', product: { slug: 'iphone-13' } } }], ...over,
    });
    const unpaid = orderFollowUp(order(), shop, 'https://phonehub.shops.test')!;
    expect(unpaid.message).toContain('1. iPhone 13 - 128GB / Black / New (x1): KES 78,000');
    expect(unpaid.message).toContain('Balance to pay: KES 78,000.');
    expect(orderFollowUp(order({ status: 'PAID', fulfilmentStatus: 'SHIPPED' }), shop, origin)!.message).toContain('is on its way');
    expect(orderFollowUp(order({ status: 'PAID' }), shop, origin)!.message).not.toContain('Balance to pay');
    expect(orderFollowUp(order({ status: 'CANCELLED' }), shop, origin)).toBeNull();
    expect(orderFollowUp(order({ phone: null }), shop, origin)).toBeNull();
  });
});
