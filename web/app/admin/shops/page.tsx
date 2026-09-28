"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '../admin-api';

type Shop = {
  id: string; slug: string; name: string; customDomain: string | null;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED'; currency: string; createdAt: string;
  productCount: number; orderCount: number; customerCount: number;
};

type Stats = {
  shopCount: number; activeShopCount: number; totalOrders: number;
  paidOrderCount: number; totalRevenueKes: number; totalCustomers: number;
};

export default function AdminShopsPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [authFailed, setAuthFailed] = useState(false);

  async function load() {
    const [shopsRes, statsRes] = await Promise.all([adminFetch('/admin/shops'), adminFetch('/admin/stats')]);
    if (shopsRes.status === 401 || statsRes.status === 401) {
      setAuthFailed(true);
      return;
    }
    setShops(await shopsRes.json());
    setStats(await statsRes.json());
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (authFailed) router.replace('/admin/login');
  }, [authFailed, router]);

  async function onSetStatus(shopId: string, status: Shop['status']) {
    await adminFetch(`/admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  if (authFailed) return null;

  return (
    <div>
      <h3>Platform overview</h3>
      {stats ? (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <Stat label="Shops" value={stats.shopCount} />
          <Stat label="Active shops" value={stats.activeShopCount} />
          <Stat label="Total orders" value={stats.totalOrders} />
          <Stat label="Paid orders" value={stats.paidOrderCount} />
          <Stat label="Total revenue" value={`KES ${stats.totalRevenueKes.toLocaleString()}`} />
          <Stat label="Customers" value={stats.totalCustomers} />
        </div>
      ) : null}

      <h3>Shops</h3>
      {!shops ? <p>Loading...</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: 8 }}>Shop</th>
              <th style={{ padding: 8 }}>Domain</th>
              <th style={{ padding: 8 }}>Products</th>
              <th style={{ padding: 8 }}>Orders</th>
              <th style={{ padding: 8 }}>Customers</th>
              <th style={{ padding: 8 }}>Created</th>
              <th style={{ padding: 8 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shops.map((shop) => (
              <tr key={shop.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{shop.name} <span style={{ color: '#666' }}>({shop.slug})</span></td>
                <td style={{ padding: 8 }}>{shop.customDomain ?? `${shop.slug}.dukamall.app`}</td>
                <td style={{ padding: 8 }}>{shop.productCount}</td>
                <td style={{ padding: 8 }}>{shop.orderCount}</td>
                <td style={{ padding: 8 }}>{shop.customerCount}</td>
                <td style={{ padding: 8 }}>{new Date(shop.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: 8 }}>
                  <select value={shop.status} onChange={(e) => onSetStatus(shop.id, e.target.value as Shop['status'])}>
                    <option value="TRIAL">TRIAL</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: '1px solid #ddd', padding: 12, minWidth: 120 }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
