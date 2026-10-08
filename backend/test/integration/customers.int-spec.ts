import { NotFoundException } from '@nestjs/common';
import { PortalCustomerService } from '../../src/portal-customer/portal-customer.service';
import { cleanup, close, makeCustomer, makeOrder, makeShop, prisma } from './helpers';

const service = new PortalCustomerService(prisma);
const list = async (shopId: string, query: any = {}) => (await service.list(shopId, { pageSize: 100, ...query })).customers;
const byName = <T extends { name: string }>(rows: T[], name: string) => rows.find((r) => r.name === name);

afterAll(async () => { await cleanup(); await close(); });

describe('customers: who bought from this shop, matched in SQL', () => {
  it('treats different spellings of one phone number as one person', async () => {
    const shop = await makeShop();
    await makeOrder(shop.id, { firstName: 'Amina', lastName: 'W', phone: '0722123456', status: 'PAID', totalKes: 1000 });
    await makeOrder(shop.id, { firstName: 'Amina', lastName: 'W', phone: '+254 722 123 456', status: 'PAID', totalKes: 2000 });
    await makeOrder(shop.id, { firstName: 'Amina', lastName: 'W', phone: '254722123456', status: 'PAID', totalKes: 500 });
    const rows = await list(shop.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ orderCount: 3, paidOrderCount: 3, lifetimeValueKes: 3500, hasAccount: false });
  });

  it('keeps different people apart', async () => {
    const shop = await makeShop();
    await makeOrder(shop.id, { firstName: 'A', phone: '0722000001' });
    await makeOrder(shop.id, { firstName: 'B', phone: '0722000002' });
    await makeOrder(shop.id, { firstName: 'C', email: 'c@x.test' });
    expect(await list(shop.id)).toHaveLength(3);
  });

  it('matches email regardless of case', async () => {
    const shop = await makeShop();
    await makeOrder(shop.id, { firstName: 'Bob', email: 'Bob@Example.TEST' });
    await makeOrder(shop.id, { firstName: 'Bob', email: ' bob@example.test ' });
    expect(await list(shop.id)).toHaveLength(1);
  });

  it('joins a phone-only order to the person who used that phone with an email', async () => {
    const shop = await makeShop();
    await makeOrder(shop.id, { firstName: 'Cy', email: 'cy@x.test', phone: '0733111222' });
    await makeOrder(shop.id, { firstName: 'Cy', phone: '+254733111222' }); // e.g. a WhatsApp order
    const rows = await list(shop.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].orderCount).toBe(2);
    expect(rows[0].key).toBe('e_cy@x.test');
  });

  it("attributes a guest order to an existing account with the same email or phone", async () => {
    const shop = await makeShop();
    const acct = await makeCustomer(shop.id, { email: 'dee@x.test', phone: '0744555666', firstName: 'Dee', lastName: 'Ann' });
    await makeOrder(shop.id, { customerId: acct.id, status: 'PAID', totalKes: 1000 });
    await makeOrder(shop.id, { email: 'DEE@x.test', status: 'PAID', totalKes: 2000 });          // guest, same email
    await makeOrder(shop.id, { phone: '+254744555666', status: 'PAID', totalKes: 4000 });        // guest, same phone
    const rows = await list(shop.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: `c_${acct.id}`, hasAccount: true, name: 'Dee Ann', orderCount: 3, lifetimeValueKes: 7000 });
  });

  it('lists accounts that have never ordered', async () => {
    const shop = await makeShop();
    await makeCustomer(shop.id, { email: 'new@x.test', firstName: 'No', lastName: 'Orders' });
    const rows = await list(shop.id);
    expect(rows[0]).toMatchObject({ name: 'No Orders', orderCount: 0, lifetimeValueKes: 0, lastOrderAt: null });
  });

  it('counts only PAID orders toward spend and ignores cancelled ones entirely', async () => {
    const shop = await makeShop();
    const phone = '0755000111';
    await makeOrder(shop.id, { phone, status: 'PAID', totalKes: 1000 });
    await makeOrder(shop.id, { phone, status: 'PENDING', totalKes: 999 });
    await makeOrder(shop.id, { phone, status: 'CANCELLED', totalKes: 5000 });
    const [row] = await list(shop.id);
    expect(row.orderCount).toBe(2);        // paid + pending, not cancelled
    expect(row.paidOrderCount).toBe(1);
    expect(row.lifetimeValueKes).toBe(1000);
  });

  it("never leaks another shop's customers or orders", async () => {
    const mine = await makeShop(); const theirs = await makeShop();
    await makeOrder(mine.id, { firstName: 'Mine', phone: '0766000001' });
    await makeOrder(theirs.id, { firstName: 'Theirs', phone: '0766000001' }); // same phone, different shop
    const rows = await list(mine.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Mine Buyer');
    expect(rows[0].orderCount).toBe(1);
    const theirKey = (await list(theirs.id))[0].key;
    await expect(service.get(mine.id, `c_nonexistent`)).rejects.toBeInstanceOf(NotFoundException);
    // A key from the other shop's list is not found here either.
    const other = await makeCustomer(theirs.id, { email: 'other@x.test' });
    await expect(service.get(mine.id, `c_${other.id}`)).rejects.toBeInstanceOf(NotFoundException);
    expect(theirKey).toBeDefined();
  });

  it('searches by name, email and any spelling of a phone, treating % and _ literally', async () => {
    const shop = await makeShop();
    await makeOrder(shop.id, { firstName: 'Zuri', lastName: 'Kamau', email: 'zuri@x.test', phone: '0777123123' });
    await makeOrder(shop.id, { firstName: 'Other', phone: '0777999999' });
    expect(await list(shop.id, { search: 'zuri' })).toHaveLength(1);
    expect(await list(shop.id, { search: 'KAMAU' })).toHaveLength(1);
    expect(await list(shop.id, { search: '0777123123' })).toHaveLength(1);
    expect(await list(shop.id, { search: '+254777123123' })).toHaveLength(1);
    expect(await list(shop.id, { search: '%' })).toHaveLength(0);
    expect(await list(shop.id, { search: '_' })).toHaveLength(0);
  });

  it('sorts by spend and pages with a correct total', async () => {
    const shop = await makeShop();
    for (let i = 1; i <= 5; i++) await makeOrder(shop.id, { firstName: `P${i}`, phone: `07880000${i}0`, status: 'PAID', totalKes: i * 100 });
    const page = await service.list(shop.id, { sort: 'spent', pageSize: 2, page: 2 });
    expect(page.total).toBe(5);
    expect(page.totalPages).toBe(3);
    expect(page.customers.map((c) => c.lifetimeValueKes)).toEqual([300, 200]);
    const past = await service.list(shop.id, { page: 9, pageSize: 2 });
    expect(past.customers).toHaveLength(0);
    expect(past.total).toBe(5);
  });

  it("returns a person's orders and matching WhatsApp enquiries in detail", async () => {
    const shop = await makeShop();
    await makeOrder(shop.id, { firstName: 'Eve', phone: '0799111000', status: 'PAID', totalKes: 1500 });
    await prisma.cartLead.create({ data: { shopId: shop.id, source: 'WHATSAPP_ORDER', customerName: 'Eve', customerPhone: '+254799111000' } as any });
    await prisma.cartLead.create({ data: { shopId: shop.id, source: 'WHATSAPP_ORDER', customerName: 'Someone else', customerPhone: '0799222000' } as any });
    const [row] = await list(shop.id, { search: 'eve' });
    const detail = await service.get(shop.id, row.key);
    expect(detail.orders).toHaveLength(1);
    expect(detail.orders[0].totalKes).toBe(1500);
    expect(detail.leads).toHaveLength(1);
    expect(byName([row], 'Eve Buyer')).toBeDefined();
  });
});
