"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '../../portal-api';
import { FulfilmentBadge, PaymentBadge, SOURCE_LABEL, money, whatsappLink } from '../../order-ui';

type Order = {
  id: string; orderNumber: string; status: 'PENDING' | 'PAID' | 'CANCELLED'; fulfilmentStatus: 'UNFULFILLED' | 'SHIPPED' | 'DELIVERED';
  source: keyof typeof SOURCE_LABEL; totalKes: number; createdAt: string;
};
type Lead = { id: string; source: 'WHATSAPP_ORDER' | 'ABANDONED_CART'; status: string; createdAt: string; convertedOrderId: string | null };
type Detail = {
  key: string; hasAccount: boolean; name: string; email: string | null; phone: string | null;
  firstSeenAt: string; lastOrderAt: string | null; orderCount: number; paidOrderCount: number; lifetimeValueKes: number;
  orders: Order[]; leads: Lead[];
};

const muted = { color: 'var(--p-muted)' } as const;

export default function CustomerDetailPage() {
  const params = useParams<{ key: string }>();
  const key = decodeURIComponent(params.key);
  const [customer, setCustomer] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    portalFetch(`/portal/customers/${encodeURIComponent(key)}`).then(async (res) => {
      if (res.ok) setCustomer(await res.json());
      else setMissing(true);
    });
  }, [key]);

  if (missing) return <div className="portal-empty">That customer wasn&apos;t found. <Link href="/portal/customers">Back to customers</Link></div>;
  if (!customer) return <p>Loading...</p>;

  const [first, ...rest] = customer.name.split(/\s+/);
  const newOrderHref = `/portal/orders/new?${new URLSearchParams({
    first: first ?? '', last: rest.join(' '), phone: customer.phone ?? '', email: customer.email ?? '',
  }).toString()}`;
  const chat = whatsappLink(customer.phone, `Hi ${first || 'there'}, `);
  const average = customer.paidOrderCount ? Math.round(customer.lifetimeValueKes / customer.paidOrderCount) : 0;

  return (
    <div>
      <p style={{ margin: '0 0 8px' }}><Link href="/portal/customers">&larr; All customers</Link></p>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0 }}>{customer.name || 'No name'}</h3>
          <span className={`portal-badge ${customer.hasAccount ? 'is-info' : 'is-muted'}`}>{customer.hasAccount ? 'Has an account' : 'Guest'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {chat ? <a href={chat} target="_blank" rel="noopener noreferrer" className="portal-btn-outline portal-btn">WhatsApp</a> : null}
          <Link href={newOrderHref} className="portal-btn">New order</Link>
        </div>
      </div>

      <div className="portal-stat-row">
        <div className="portal-stat"><div className="label">Spent</div><div className="value">{money(customer.lifetimeValueKes)}</div></div>
        <div className="portal-stat"><div className="label">Orders</div><div className="value">{customer.orderCount}</div></div>
        <div className="portal-stat"><div className="label">Average paid order</div><div className="value">{customer.paidOrderCount ? money(average) : '–'}</div></div>
      </div>

      <div className="po-grid">
        <div>
          <div className="portal-card" style={{ padding: 0, overflowX: 'auto' }}>
            <h4 style={{ padding: '16px 16px 0' }}>Orders</h4>
            {customer.orders.length === 0 ? <p style={{ padding: '0 16px 16px', ...muted }}>No orders yet.</p> : (
              <table className="portal-table">
                <thead><tr><th>Order</th><th>Date</th><th>Total</th><th>Payment</th><th>Delivery</th><th>Source</th></tr></thead>
                <tbody>
                  {customer.orders.map((o) => (
                    <tr key={o.id}>
                      <td><Link href={`/portal/orders/${o.id}`}><strong>{o.orderNumber}</strong></Link></td>
                      <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td>{money(o.totalKes)}</td>
                      <td><PaymentBadge status={o.status} /></td>
                      <td><FulfilmentBadge status={o.fulfilmentStatus} cancelled={o.status === 'CANCELLED'} /></td>
                      <td style={{ fontSize: 13 }}>{SOURCE_LABEL[o.source]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <div className="portal-card">
            <h4>Contact</h4>
            <dl className="po-kv">
              <dt>Phone</dt><dd>{customer.phone ?? '—'}</dd>
              <dt>Email</dt><dd>{customer.email ?? '—'}</dd>
              <dt>First seen</dt><dd>{new Date(customer.firstSeenAt).toLocaleDateString()}</dd>
              <dt>Last order</dt><dd>{customer.lastOrderAt ? new Date(customer.lastOrderAt).toLocaleDateString() : '—'}</dd>
            </dl>
          </div>
          {customer.leads.length > 0 ? (
            <div className="portal-card" style={{ marginTop: 16 }}>
              <h4>Enquiries</h4>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                {customer.leads.map((l) => (
                  <li key={l.id}>
                    {l.source === 'WHATSAPP_ORDER' ? 'WhatsApp order' : 'Abandoned cart'} &middot; {new Date(l.createdAt).toLocaleDateString()} &middot; {l.status.toLowerCase()}
                    {l.convertedOrderId ? <> &middot; <Link href={`/portal/orders/${l.convertedOrderId}`}>order</Link></> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
