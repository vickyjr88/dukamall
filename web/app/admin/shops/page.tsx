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
  paymentReady: boolean;
};

type Stats = {
  shopCount: number; activeShopCount: number; totalOrders: number;
  paidOrderCount: number; totalRevenueKes: number; totalCustomers: number;
};

const BADGE_CLASS: Record<Shop['status'], string> = { TRIAL: 'is-trial', ACTIVE: 'is-active', SUSPENDED: 'is-suspended' };

export default function AdminShopsPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | Shop['status']>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load() {
    setLoading(true);
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (status) query.set('status', status);
    query.set('page', String(page));
    query.set('pageSize', String(pageSize));
    const [shopsRes, statsRes] = await Promise.all([
      adminFetch(`/admin/shops?${query.toString()}`),
      adminFetch('/admin/stats'),
    ]);
    if (shopsRes.status === 401 || statsRes.status === 401) {
      setAuthFailed(true);
      return;
    }
    const data = await shopsRes.json();
    setShops(data.shops);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setStats(await statsRes.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [search, status, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authFailed) router.replace('/admin/login');
  }, [authFailed, router]);

  function updateFilter(next: { search?: string; status?: '' | Shop['status'] }) {
    if (next.search !== undefined) setSearch(next.search);
    if (next.status !== undefined) setStatus(next.status);
    setPage(1);
  }

  const hasFilters = Boolean(search || status);

  async function onSetStatus(shopId: string, newStatus: Shop['status']) {
    // A reason prompt only when suspending -- reactivating a shop (or
    // switching TRIAL<->ACTIVE) doesn't need one, and a mandatory prompt
    // there would just be a click a support action has to dismiss every
    // time.
    let reason: string | undefined;
    if (newStatus === 'SUSPENDED') {
      const entered = window.prompt('Why is this shop being suspended? (shown in its audit log)');
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

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <form
          style={{ display: 'flex', gap: 8, marginBottom: 14 }}
          onSubmit={(e) => { e.preventDefault(); updateFilter({ search: searchDraft.trim() }); }}
        >
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by name or slug..."
            aria-label="Search shops"
            style={{ flex: 1 }}
          />
          <button type="submit" className="admin-btn">Search</button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase' }}>
            Status
            <select value={status} onChange={(e) => updateFilter({ status: e.target.value as '' | Shop['status'] })} style={{ minWidth: 140 }}>
              <option value="">All</option>
              <option value="TRIAL">TRIAL</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase' }}>
            Per page
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ minWidth: 90 }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {hasFilters ? (
            <button
              type="button"
              className="admin-btn-ghost"
              onClick={() => { setSearchDraft(''); setSearch(''); setStatus(''); setPage(1); }}
            >
              Clear filters
            </button>
          ) : null}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--a-muted)' }}>
            {loading ? 'Loading...' : `${total} shop${total === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {!shops ? <p>Loading...</p> : shops.length === 0 ? (
        <div className="admin-empty">{hasFilters ? 'No shops match those filters.' : 'No shops yet.'}</div>
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
                <th>Payments</th>
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
                  <td>
                    <span className={`admin-badge ${shop.paymentReady ? 'is-active' : 'is-trial'}`}>
                      {shop.paymentReady ? 'Ready' : 'Not configured'}
                    </span>
                  </td>
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

      {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onChange={setPage} /> : null}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = Array.from(pages).sort((a, b) => a - b);

  const items: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push('ellipsis');
    items.push(p);
    prev = p;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20 }}>
      <button className="admin-btn-outline admin-btn admin-btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {items.map((item, i) =>
        item === 'ellipsis' ? (
          <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--a-muted)' }}>&hellip;</span>
        ) : (
          <button
            key={item}
            className={item === page ? 'admin-btn admin-btn-sm' : 'admin-btn-outline admin-btn admin-btn-sm'}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}
      <button className="admin-btn-outline admin-btn admin-btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
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
