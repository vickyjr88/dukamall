"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useCustomerFetch } from '@/app/lib/use-customer-fetch';

type OrderLine = { id: string; quantity: number; priceKes: string; variant: { name: string; product: { name: string } } };
type Order = { id: string; orderNumber: string; status: string; totalKes: string; createdAt: string; lines: OrderLine[] };

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: '#fdeee0', fg: '#a85b00' },
  PAID: { bg: '#e6f4ec', fg: '#0f7a40' },
  CANCELLED: { bg: '#fdecea', fg: '#b3261e' },
};

export default function OrderHistoryPage() {
  const router = useRouter();
  const { customer, ready } = useCustomerAuth();
  const customerFetch = useCustomerFetch();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (ready && !customer) { router.replace('/account/login'); return; }
    if (!customer) return;
    customerFetch('/account/orders').then((r) => r.json()).then(setOrders);
  }, [ready, customer, router, customerFetch]);

  if (!ready || !customer) return null;

  return (
    <main className="shop-container shop-section">
      <span className="eyebrow">My account</span>
      <h1 style={{ marginBottom: 'var(--shop-space-6)' }}>Order history</h1>

      {!orders ? <p>Loading...</p> : orders.length === 0 ? (
        <div className="empty-state">
          <h3>No orders yet</h3>
          <p>When you place an order, it will show up here.</p>
          <a href="/" className="btn btn-primary">Start shopping</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--shop-line)' }}>
          {orders.map((order) => {
            const style = STATUS_STYLE[order.status] ?? { bg: 'var(--shop-surface)', fg: 'var(--shop-muted)' };
            return (
              <div key={order.id} style={{ background: '#fff', padding: 'var(--shop-space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--shop-space-2)' }}>
                  <strong>{order.orderNumber}</strong>
                  <span style={{
                    fontSize: 'var(--shop-text-xs)', fontWeight: 700, letterSpacing: '0.04em',
                    padding: '3px 10px', borderRadius: 'var(--shop-radius-sm)',
                    background: style.bg, color: style.fg,
                  }}>
                    {order.status}
                  </span>
                </div>
                <p style={{ fontSize: 'var(--shop-text-sm)', color: 'var(--shop-muted)', marginBottom: 'var(--shop-space-3)' }}>
                  {new Date(order.createdAt).toLocaleDateString()}
                </p>
                <ul style={{ margin: '0 0 var(--shop-space-3)', paddingLeft: 18, fontSize: 'var(--shop-text-sm)', color: 'var(--shop-ink-soft)' }}>
                  {order.lines.map((line) => (
                    <li key={line.id}>{line.quantity} x {line.variant.product.name} ({line.variant.name})</li>
                  ))}
                </ul>
                <strong>KES {Number(order.totalKes).toLocaleString()}</strong>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
