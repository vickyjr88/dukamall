"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { DashboardTrend } from '../dashboard-trend';
import { ago } from '../format';
import { Pagination } from '../pagination';

type Shop = {
  id: string; slug: string; name: string; customDomain: string | null; storefrontUrl: string;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED'; currency: string; createdAt: string;
  productCount: number; orderCount: number; customerCount: number;
  paidRevenue: number; lastOrderAt: string | null; lastLoginAt: string | null;
  paymentReady: boolean;
  billingPlan: 'TRIAL' | 'BASIC' | 'PRO'; trialEndsAt: string | null; trialExpiringSoon: boolean;
};

type Stats = {
  shopCount: number; activeShopCount: number; totalOrders: number;
  paidOrderCount: number; totalRevenueKes: number; totalCustomers: number;
};

type Sort = 'created' | 'name' | 'orders' | 'revenue' | 'lastOrder' | 'lastLogin';
const SORT_LABEL: Record<Sort, string> = {
  created: 'Newest', name: 'Name', orders: 'Orders', revenue: 'Revenue', lastOrder: 'Last order', lastLogin: 'Last login',
};
const BADGE_CLASS: Record<Shop['status'], string> = { TRIAL: 'is-trial', ACTIVE: 'is-active', SUSPENDED: 'is-suspended' };
const muted = { color: 'var(--a-muted)' } as const;

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [payments, setPayments] = useState('');
  const [trial, setTrial] = useState('');
  const [inactive, setInactive] = useState('');
  const [sort, setSort] = useState<Sort>('created');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  function filterQuery() {
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (status) q.set('status', status);
    if (plan) q.set('plan', plan);
    if (payments) q.set('payments', payments);
    if (trial) q.set('trial', trial);
    if (inactive) q.set('inactiveDays', inactive);
    q.set('sort', sort);
    q.set('dir', dir);
    return q;
  }

  async function load() {
    setLoading(true);
    const query = filterQuery();
    query.set('page', String(page));
    query.set('pageSize', String(pageSize));
    const [shopsRes, statsRes] = await Promise.all([adminFetch(`/admin/shops?${query.toString()}`), adminFetch('/admin/stats')]);
    if (shopsRes.ok) {
      const data = await shopsRes.json();
      setShops(data.shops); setTotal(data.total); setTotalPages(data.totalPages);
    }
    if (statsRes.ok) setStats(await statsRes.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, [search, status, plan, payments, trial, inactive, sort, dir, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (fn: () => void) => { fn(); setPage(1); };
  const hasFilters = Boolean(search || status || plan || payments || trial || inactive);

  async function onExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await adminFetch(`/admin/shops/export-csv?${filterQuery().toString()}`);
      if (!res.ok) throw new Error('The export failed.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `shops-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  async function onSetStatus(shopId: string, newStatus: Shop['status']) {
    // A reason prompt only when suspending -- reactivating a shop (or
    // switching TRIAL<->ACTIVE) doesn't need one, and a mandatory prompt
    // there would just be a click a support action has to dismiss every
    // time.
    let reason: string | undefined;
    if (newStatus === 'SUSPENDED') {
      const entered = window.prompt('Why is this shop being suspended? (shown in its audit log; the owner is emailed that it was suspended, but not this reason)');
      if (entered === null) return; // Cancelled -- leave the status alone.
      reason = entered.trim() || undefined;
    }
    await adminFetch(`/admin/shops/${shopId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, reason }),
    });
    load();
  }

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

      <div className="admin-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Shops</h3>
        <button type="button" className="admin-btn-outline admin-btn" disabled={exporting || total === 0} onClick={onExport}>{exporting ? 'Preparing...' : 'Export CSV'}</button>
      </div>
      {error ? <div className="admin-alert is-error">{error}</div> : null}

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <form style={{ display: 'flex', gap: 8, marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); change(() => setSearch(searchDraft.trim())); }}>
          <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search by name or slug..." aria-label="Search shops" style={{ flex: 1 }} />
          <button type="submit" className="admin-btn">Search</button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <label className="admin-filter">Status
            <select value={status} onChange={(e) => change(() => setStatus(e.target.value))} style={{ minWidth: 120 }}>
              <option value="">All</option><option value="TRIAL">Trial</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option>
            </select>
          </label>
          <label className="admin-filter">Plan
            <select value={plan} onChange={(e) => change(() => setPlan(e.target.value))} style={{ minWidth: 110 }}>
              <option value="">All</option><option value="TRIAL">Trial</option><option value="BASIC">Basic</option><option value="PRO">Pro</option>
            </select>
          </label>
          <label className="admin-filter">Payments
            <select value={payments} onChange={(e) => change(() => setPayments(e.target.value))} style={{ minWidth: 140 }}>
              <option value="">Any</option><option value="ready">Ready</option><option value="missing">Not configured</option>
            </select>
          </label>
          <label className="admin-filter">Trial
            <select value={trial} onChange={(e) => change(() => setTrial(e.target.value))} style={{ minWidth: 130 }}>
              <option value="">Any</option><option value="expiring">Ending within 7 days</option><option value="expired">Already ended</option>
            </select>
          </label>
          <label className="admin-filter">Activity
            <select value={inactive} onChange={(e) => change(() => setInactive(e.target.value))} style={{ minWidth: 160 }}>
              <option value="">Any</option><option value="14">No orders in 14 days</option><option value="30">No orders in 30 days</option><option value="90">No orders in 90 days</option>
            </select>
          </label>
          <label className="admin-filter">Sort by
            <select value={sort} onChange={(e) => change(() => { const next = e.target.value as Sort; setSort(next); setDir(next === 'name' ? 'asc' : 'desc'); })} style={{ minWidth: 120 }}>
              {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          </label>
          <button type="button" className="admin-btn-outline admin-btn admin-btn-sm" onClick={() => change(() => setDir(dir === 'asc' ? 'desc' : 'asc'))} aria-label="Reverse sort order">{dir === 'asc' ? '↑ Ascending' : '↓ Descending'}</button>
          <label className="admin-filter">Per page
            <select value={pageSize} onChange={(e) => change(() => setPageSize(Number(e.target.value)))} style={{ minWidth: 80 }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {hasFilters ? (
            <button type="button" className="admin-btn-ghost" onClick={() => { setSearchDraft(''); setSearch(''); setStatus(''); setPlan(''); setPayments(''); setTrial(''); setInactive(''); setPage(1); }}>Clear filters</button>
          ) : null}
          <span style={{ marginLeft: 'auto', fontSize: 13, ...muted }}>{loading ? 'Loading...' : `${total} shop${total === 1 ? '' : 's'}`}</span>
        </div>
      </div>

      {!shops ? <p>Loading...</p> : shops.length === 0 ? (
        <div className="admin-empty">{hasFilters ? 'No shops match those filters.' : 'No shops yet.'}</div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th>Shop</th><th>Orders</th><th>Revenue</th><th>Last order</th><th>Last login</th><th>Payments</th><th>Plan</th><th>Status</th></tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.id}>
                  <td>
                    <Link href={`/admin/shops/${shop.id}`}><strong>{shop.name}</strong></Link>
                    <div style={{ fontSize: 12, ...muted }}>{shop.storefrontUrl.replace(/^https?:\/\//, '')}</div>
                  </td>
                  <td>{shop.orderCount}<div style={{ fontSize: 12, ...muted }}>{shop.productCount} products</div></td>
                  <td>{shop.currency} {shop.paidRevenue.toLocaleString()}</td>
                  <td style={shop.lastOrderAt ? undefined : muted}>{ago(shop.lastOrderAt)}</td>
                  <td style={shop.lastLoginAt ? undefined : muted}>{ago(shop.lastLoginAt)}</td>
                  <td>
                    <span className={`admin-badge ${shop.paymentReady ? 'is-active' : 'is-trial'}`}>{shop.paymentReady ? 'Ready' : 'Not configured'}</span>
                  </td>
                  <td>
                    {shop.billingPlan}
                    {shop.trialEndsAt ? (
                      <div style={{ fontSize: 12, ...(shop.trialExpiringSoon || new Date(shop.trialEndsAt) < new Date() ? { color: 'var(--a-warn)', fontWeight: 600 } : muted) }}>
                        {new Date(shop.trialEndsAt) < new Date() ? 'ended' : 'ends'} {new Date(shop.trialEndsAt).toLocaleDateString()}
                      </div>
                    ) : shop.billingPlan === 'TRIAL' ? <div style={{ fontSize: 12, ...muted }}>no end date</div> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className={`admin-badge ${BADGE_CLASS[shop.status]}`} style={{ marginRight: 8 }}>{shop.status}</span>
                    <select value={shop.status} onChange={(e) => onSetStatus(shop.id, e.target.value as Shop['status'])} aria-label={`Change status of ${shop.name}`}>
                      <option value="TRIAL">TRIAL</option><option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
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
