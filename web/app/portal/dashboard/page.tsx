"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type SalesSummary = {
  orderCount: number;
  totalRevenueKes: number;
  topProducts: { productName: string; variantName: string; quantitySold: number; revenueKes: number }[];
};

type StockRow = { id: string; sku: string; name: string; stockOnHand: number; product: { name: string } };

const LOW_STOCK_THRESHOLD = 3;

export default function DashboardPage() {
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [stock, setStock] = useState<StockRow[] | null>(null);

  useEffect(() => {
    portalFetch('/portal/reports/sales').then((r) => r.json()).then(setSales);
    portalFetch('/portal/reports/stock').then((r) => r.json()).then(setStock);
  }, []);

  const lowStock = stock?.filter((s) => s.stockOnHand <= LOW_STOCK_THRESHOLD) ?? [];

  return (
    <div>
      <h3>Dashboard</h3>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ border: '1px solid #ddd', padding: 16, flex: 1 }}>
          <div style={{ fontSize: 13, color: '#666' }}>Paid orders</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{sales?.orderCount ?? '...'}</div>
        </div>
        <div style={{ border: '1px solid #ddd', padding: 16, flex: 1 }}>
          <div style={{ fontSize: 13, color: '#666' }}>Total revenue</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {sales ? `KES ${sales.totalRevenueKes.toLocaleString()}` : '...'}
          </div>
        </div>
        <div style={{ border: '1px solid #ddd', padding: 16, flex: 1 }}>
          <div style={{ fontSize: 13, color: '#666' }}>Low stock (&le; {LOW_STOCK_THRESHOLD})</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: lowStock.length > 0 ? '#b3261e' : 'inherit' }}>
            {stock ? lowStock.length : '...'}
          </div>
        </div>
      </div>

      <h4>Top products</h4>
      {!sales ? <p>Loading...</p> : sales.topProducts.length === 0 ? (
        <p>No paid orders yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginBottom: 24 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: 8 }}>Product</th>
              <th style={{ padding: 8 }}>Sold</th>
              <th style={{ padding: 8 }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {sales.topProducts.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{p.productName} ({p.variantName})</td>
                <td style={{ padding: 8 }}>{p.quantitySold}</td>
                <td style={{ padding: 8 }}>KES {p.revenueKes.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>Stock levels</h4>
      {!stock ? <p>Loading...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: 8 }}>Product</th>
              <th style={{ padding: 8 }}>SKU</th>
              <th style={{ padding: 8 }}>On hand</th>
            </tr>
          </thead>
          <tbody>
            {stock.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #eee', color: s.stockOnHand <= LOW_STOCK_THRESHOLD ? '#b3261e' : 'inherit' }}>
                <td style={{ padding: 8 }}>{s.product.name} ({s.name})</td>
                <td style={{ padding: 8 }}>{s.sku}</td>
                <td style={{ padding: 8 }}>{s.stockOnHand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
