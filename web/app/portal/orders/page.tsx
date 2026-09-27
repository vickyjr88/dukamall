"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type OrderLine = { id: string; quantity: number; priceKes: string; variant: { name: string; product: { name: string } } };
type Order = {
  id: string; orderNumber: string; status: 'PENDING' | 'PAID' | 'CANCELLED';
  firstName: string; lastName: string; email: string | null; phone: string | null;
  totalKes: string; createdAt: string; lines: OrderLine[];
};

const STATUS_FILTERS = ['ALL', 'PENDING', 'PAID', 'CANCELLED'] as const;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState<typeof STATUS_FILTERS[number]>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const query = filter === 'ALL' ? '' : `?status=${filter}`;
    const res = await portalFetch(`/portal/orders${query}`);
    if (res.ok) setOrders(await res.json());
  }

  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSetStatus(orderId: string, status: Order['status']) {
    await portalFetch(`/portal/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <div>
      <h3>Orders</h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{ fontWeight: filter === s ? 700 : 400, textDecoration: filter === s ? 'underline' : 'none' }}
          >
            {s}
          </button>
        ))}
      </div>

      {!orders ? <p>Loading...</p> : orders.length === 0 ? (
        <p>No orders{filter !== 'ALL' ? ` with status ${filter}` : ''} yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: 8 }}>Order</th>
              <th style={{ padding: 8 }}>Customer</th>
              <th style={{ padding: 8 }}>Date</th>
              <th style={{ padding: 8 }}>Total</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <>
                <tr key={order.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 8 }}>{order.orderNumber}</td>
                  <td style={{ padding: 8 }}>
                    {order.firstName} {order.lastName}
                    {order.phone ? <div style={{ fontSize: 12, color: '#666' }}>{order.phone}</div> : null}
                  </td>
                  <td style={{ padding: 8 }}>{new Date(order.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: 8 }}>KES {Number(order.totalKes).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>
                    <select value={order.status} onChange={(e) => onSetStatus(order.id, e.target.value as Order['status'])}>
                      <option value="PENDING">PENDING</option>
                      <option value="PAID">PAID</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </td>
                  <td style={{ padding: 8 }}>
                    <button onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                      {expanded === order.id ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
                {expanded === order.id ? (
                  <tr key={`${order.id}-detail`}>
                    <td colSpan={6} style={{ padding: '0 8px 12px', background: '#fafafa' }}>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {order.lines.map((line) => (
                          <li key={line.id}>
                            {line.quantity} x {line.variant.product.name} ({line.variant.name}) -- KES {Number(line.priceKes).toLocaleString()} each
                          </li>
                        ))}
                      </ul>
                      {order.email ? <p style={{ margin: '8px 0 0', fontSize: 13 }}>Email: {order.email}</p> : null}
                    </td>
                  </tr>
                ) : null}
              </>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
