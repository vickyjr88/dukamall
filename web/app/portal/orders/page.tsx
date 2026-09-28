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
const BADGE_CLASS: Record<Order['status'], string> = { PENDING: 'is-pending', PAID: 'is-paid', CANCELLED: 'is-cancelled' };

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
      <div className="portal-page-head"><h3>Orders</h3></div>

      <div className="portal-tabs">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={filter === s ? 'is-active' : ''} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>

      {!orders ? <p>Loading...</p> : orders.length === 0 ? (
        <div className="portal-empty">No orders{filter !== 'ALL' ? ` with status ${filter}` : ''} yet.</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <>
                  <tr key={order.id}>
                    <td>{order.orderNumber}</td>
                    <td>
                      {order.firstName} {order.lastName}
                      {order.phone ? <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{order.phone}</div> : null}
                    </td>
                    <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td>KES {Number(order.totalKes).toLocaleString()}</td>
                    <td>
                      <span className={`portal-badge ${BADGE_CLASS[order.status]}`} style={{ marginRight: 8 }}>{order.status}</span>
                      <select value={order.status} onChange={(e) => onSetStatus(order.id, e.target.value as Order['status'])}>
                        <option value="PENDING">PENDING</option>
                        <option value="PAID">PAID</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </td>
                    <td>
                      <button className="portal-btn-ghost" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                        {expanded === order.id ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>
                  {expanded === order.id ? (
                    <tr key={`${order.id}-detail`}>
                      <td colSpan={6} style={{ background: 'var(--p-paper)' }}>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {order.lines.map((line) => (
                            <li key={line.id}>
                              {line.quantity} x {line.variant.product.name} ({line.variant.name}) -- KES {Number(line.priceKes).toLocaleString()} each
                            </li>
                          ))}
                        </ul>
                        {order.email ? <p style={{ marginTop: 8, fontSize: 13 }}>Email: {order.email}</p> : null}
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
