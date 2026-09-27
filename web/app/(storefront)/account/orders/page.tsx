"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useCustomerFetch } from '@/app/lib/use-customer-fetch';

type OrderLine = { id: string; quantity: number; priceKes: string; variant: { name: string; product: { name: string } } };
type Order = { id: string; orderNumber: string; status: string; totalKes: string; createdAt: string; lines: OrderLine[] };

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
    <main className="shop-container">
      <h1>Order history</h1>
      {!orders ? <p>Loading...</p> : orders.length === 0 ? (
        <p>You haven&apos;t placed any orders yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {orders.map((order) => (
            <div key={order.id} style={{ border: '1px solid var(--shop-line)', padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{order.orderNumber}</strong>
                <span>{order.status}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--shop-muted)' }}>
                {new Date(order.createdAt).toLocaleDateString()}
              </p>
              <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
                {order.lines.map((line) => (
                  <li key={line.id}>
                    {line.quantity} x {line.variant.product.name} ({line.variant.name})
                  </li>
                ))}
              </ul>
              <strong>KES {Number(order.totalKes).toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
