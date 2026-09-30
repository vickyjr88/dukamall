"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';

type SalesSummary = {
  orderCount: number;
  totalRevenueKes: number;
  topProducts: { productName: string; variantName: string; quantitySold: number; revenueKes: number }[];
};

type StockRow = { id: string; sku: string; name: string; stockOnHand: number; product: { name: string } };
type RecentOrder = { id: string; orderNumber: string; status: 'PENDING' | 'PAID' | 'CANCELLED'; firstName: string; lastName: string; totalKes: string; createdAt: string };

const LOW_STOCK_THRESHOLD = 3;
const BADGE_CLASS: Record<RecentOrder['status'], string> = { PENDING: 'is-pending', PAID: 'is-paid', CANCELLED: 'is-cancelled' };

export default function DashboardPage() {
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [stock, setStock] = useState<StockRow[] | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);

  useEffect(() => {
    portalFetch('/portal/reports/sales').then((r) => r.json()).then(setSales);
    portalFetch('/portal/reports/stock').then((r) => r.json()).then(setStock);
    portalFetch('/portal/orders?pageSize=5').then((r) => r.json()).then((d) => setRecentOrders(d.orders));
  }, []);

  const lowStock = stock?.filter((s) => s.stockOnHand <= LOW_STOCK_THRESHOLD) ?? [];

  return (
    <div>
      <div className="portal-page-head"><h3>Dashboard</h3></div>

      <div className="portal-stat-row">
        <div className="portal-stat">
          <div className="label">Paid orders</div>
          <div className="value">{sales?.orderCount ?? '–'}</div>
        </div>
        <div className="portal-stat">
          <div className="label">Total revenue</div>
          <div className="value">{sales ? `KES ${sales.totalRevenueKes.toLocaleString()}` : '–'}</div>
        </div>
        <div className="portal-stat">
          <div className="label">Low stock (&le; {LOW_STOCK_THRESHOLD})</div>
          <div className={`value${lowStock.length > 0 ? ' is-danger' : ''}`}>{stock ? lowStock.length : '–'}</div>
        </div>
      </div>

      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Recent orders
          <Link href="/portal/orders" style={{ fontSize: 12, textTransform: 'none', fontWeight: 400 }}>View all &rarr;</Link>
        </h4>
        {!recentOrders ? <p>Loading...</p> : recentOrders.length === 0 ? (
          <p style={{ color: 'var(--p-muted)' }}>No orders yet.</p>
        ) : (
          <table className="portal-table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {recentOrders.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderNumber}</td>
                  <td>{o.firstName} {o.lastName}</td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td>KES {Number(o.totalKes).toLocaleString()}</td>
                  <td><span className={`portal-badge ${BADGE_CLASS[o.status]}`}>{o.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4>Top products</h4>
        {!sales ? <p>Loading...</p> : sales.topProducts.length === 0 ? (
          <p style={{ color: 'var(--p-muted)' }}>No paid orders yet.</p>
        ) : (
          <table className="portal-table">
            <thead>
              <tr><th>Product</th><th>Sold</th><th>Revenue</th></tr>
            </thead>
            <tbody>
              {sales.topProducts.map((p, i) => (
                <tr key={i}>
                  <td>{p.productName} ({p.variantName})</td>
                  <td>{p.quantitySold}</td>
                  <td>KES {p.revenueKes.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="portal-card">
        <h4>Stock levels</h4>
        {!stock ? <p>Loading...</p> : (
          <table className="portal-table">
            <thead>
              <tr><th>Product</th><th>SKU</th><th>On hand</th></tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.id} style={s.stockOnHand <= LOW_STOCK_THRESHOLD ? { color: 'var(--p-danger)' } : undefined}>
                  <td>{s.product.name} ({s.name})</td>
                  <td>{s.sku}</td>
                  <td>{s.stockOnHand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
