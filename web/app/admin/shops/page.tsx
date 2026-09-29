"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { DashboardTrend } from '../dashboard-trend';

type Shop = {
  id: string; slug: string; name: string; customDomain: string | null;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED'; currency: string; createdAt: string;
  productCount: number; orderCount: number; customerCount: number;
};

type Stats = {
  shopCount: number; activeShopCount: number; totalOrders: number;
  paidOrderCount: number; totalRevenueKes: number; totalCustomers: number;
};

const BADGE_CLASS: Record<Shop['status'], string> = { TRIAL: 'is-trial', ACTIVE: 'is-active', SUSPENDED: 'is-suspended' };

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
    // A reason prompt only when suspending -- reactivating a shop (or
    // switching TRIAL<->ACTIVE) doesn't need one, and a mandatory prompt
    // there would just be a click a support action has to dismiss every
    // time.
    let reason: string | undefined;
    if (status === 'SUSPENDED') {
      const entered = window.prompt('Why is this shop being suspended? (shown in its audit log)');
      if (entered === null) return; // Cancelled -- leave the status alone.
      reason = entered.trim() || undefined;
    }
    await adminFetch(`/admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    });
    load();
  }

  if (authFailed) return null;

  return (
    <div>
      <div className="admin-page-head"><h3>Platform overview</h3></div>

      {stats ? (
        <div className="admin-stat-row">
          <Stat label="Shops" value={stats.shopCount} />
          <Stat label="Active shops" value={stats.activeShopCount} />
          <Stat label="Total orders" value={stats.totalOrders} />
          <Stat label="Paid orders" value={stats.paidOrderCount} />
          <Stat label="Total revenue" value={`KES ${stats.totalRevenueKes.toLocaleString()}`} />
          <Stat label="Customers" value={stats.totalCustomers} />
        </div>
      ) : null}

      <DashboardTrend />

      <div className="admin-page-head"><h3>Shops</h3></div>
      {!shops ? <p>Loading...</p> : shops.length === 0 ? (
        <div className="admin-empty">No shops yet.</div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Domain</th>
                <th>Products</th>
                <th>Orders</th>
                <th>Customers</th>
                <th>Created</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.id}>
                  <td><Link href={`/admin/shops/${shop.id}`}>{shop.name}</Link> <span style={{ color: 'var(--a-muted)' }}>({shop.slug})</span></td>
                  <td>{shop.customDomain ?? `${shop.slug}.dukamall.app`}</td>
                  <td>{shop.productCount}</td>
                  <td>{shop.orderCount}</td>
                  <td>{shop.customerCount}</td>
                  <td>{new Date(shop.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`admin-badge ${BADGE_CLASS[shop.status]}`} style={{ marginRight: 8 }}>{shop.status}</span>
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
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
