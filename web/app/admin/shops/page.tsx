"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { DashboardTrend } from '../dashboard-trend';
import { ago } from '../format';
import { viewAsShop } from '../view-as';
import { Chips, Pager, SearchField, SortHeader, SortSelect, useListState } from '../../portal/list-kit';
import { Coverage, Feature, FeatureDots, Legend, Meter } from './features';
import { NewShopForm } from './new-shop';

type Shop = {
  id: string; slug: string; name: string; customDomain: string | null; storefrontUrl: string;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED'; currency: string; createdAt: string;
  productCount: number; orderCount: number; customerCount: number;
  paidRevenue: number; lastOrderAt: string | null; lastLoginAt: string | null;
  paymentReady: boolean;
  billingPlan: 'TRIAL' | 'BASIC' | 'PRO'; trialEndsAt: string | null; trialExpiringSoon: boolean;
  features: Feature[]; coverage: Coverage;
};
type Facets = { all: number; TRIAL: number; ACTIVE: number; SUSPENDED: number; problems: number; missingBasics: number };
type Stats = {
  shopCount: number; activeShopCount: number; totalOrders: number;
  paidOrderCount: number; totalRevenueKes: number; totalCustomers: number;
};

const SORTS = [
  { value: 'created', label: 'Newest' }, { value: 'name', label: 'Name' }, { value: 'orders', label: 'Orders' }, { value: 'revenue', label: 'Revenue' },
  { value: 'lastOrder', label: 'Last order' }, { value: 'lastLogin', label: 'Last login' }, { value: 'setup', label: 'Least set up first' }, { value: 'problems', label: 'Most problems first' },
];
// Which way each sort runs by default: names and "least set up" read upwards, everything else shows the most first.
const ASCENDING_BY_DEFAULT = new Set(['name', 'setup']);
const FEATURE_OPTIONS = [
  ['payments', 'Payments'], ['catalogue', 'Products'], ['storeInfo', 'Store info'], ['whatsapp', 'WhatsApp connection'], ['facebook', 'Facebook Page'], ['threads', 'Threads'],
  ['posting', 'Auto-posting'], ['statusKit', 'WhatsApp Status'], ['share', 'Share tools'], ['dailyReport', 'Daily report'], ['tracking', 'Tracking'], ['domain', 'Own domain'],
];
const BADGE_CLASS: Record<Shop['status'], string> = { TRIAL: 'is-trial', ACTIVE: 'is-active', SUSPENDED: 'is-suspended' };
const muted = { color: 'var(--a-muted)' } as const;

export default function AdminShopsPage() {
  const { state, set, reset, ready, dirty } = useListState(
    { status: '', plan: '', payments: '', trial: '', inactive: '', feature: '', featureState: '', needs: '', dir: '' },
    { sort: 'created' },
  );
  const [shops, setShops] = useState<Shop[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  // Sort direction follows the sort's own natural way until the heading is clicked again.
  const dir = state.dir || (ASCENDING_BY_DEFAULT.has(state.sort) ? 'asc' : 'desc');

  const filterQuery = useCallback(() => {
    const q = new URLSearchParams();
    if (state.q) q.set('search', state.q);
    if (state.status) q.set('status', state.status);
    if (state.plan) q.set('plan', state.plan);
    if (state.payments) q.set('payments', state.payments);
    if (state.trial) q.set('trial', state.trial);
    if (state.inactive) q.set('inactiveDays', state.inactive);
    if (state.feature) q.set('feature', state.feature);
    if (state.feature && state.featureState) q.set('featureState', state.featureState);
    if (state.needs) q.set('needs', state.needs);
    q.set('sort', state.sort);
    q.set('dir', dir);
    return q;
  }, [state.q, state.status, state.plan, state.payments, state.trial, state.inactive, state.feature, state.featureState, state.needs, state.sort, dir]);

  const load = useCallback(async () => {
    setLoading(true);
    const query = filterQuery();
    query.set('page', String(state.page));
    query.set('pageSize', String(state.size));
    try {
      const [shopsRes, statsRes] = await Promise.all([adminFetch(`/admin/shops?${query.toString()}`), adminFetch('/admin/stats')]);
      if (shopsRes.ok) {
        const data = await shopsRes.json();
        setShops(data.shops); setTotal(data.total); setTotalPages(data.totalPages); setFacets(data.facets);
        if (data.page !== state.page) set({ page: data.page });
      }
      if (statsRes.ok) setStats(await statsRes.json());
    } finally {
      setLoading(false);
    }
  }, [filterQuery, state.page, state.size]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) void load(); }, [ready, load]);

  // One quick view: the chips are a single choice over status and "needs".
  const view = state.needs ? `needs:${state.needs}` : state.status;
  function setView(v: string) {
    if (v.startsWith('needs:')) set({ needs: v.slice(6), status: '' });
    else set({ status: v, needs: '' });
  }

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
    // A reason prompt only when suspending -- reactivating a shop (or switching TRIAL<->ACTIVE) doesn't need one.
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
    void load();
  }

  async function onViewAs(shop: Shop) {
    setOpening(shop.id); setError(null);
    const problem = await viewAsShop(shop.id, shop.storefrontUrl);
    if (problem) setError(problem);
    setOpening(null);
  }

  function onSort(sort: string) {
    // Clicking the heading already sorted by flips its direction; a new heading starts in its natural direction.
    if (sort === state.sort) set({ dir: dir === 'asc' ? 'desc' : 'asc' });
    else set({ sort, dir: '' });
  }
  const chip = (value: string, label: string, count: number | undefined, tone?: 'warn' | 'danger') => ({ value, label, count, tone });

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

      <div className="admin-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3>Shops</h3>
          <p style={{ fontSize: 13, ...muted }}>{loading && !shops ? 'Loading...' : `${total.toLocaleString()} shop${total === 1 ? '' : 's'}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="admin-btn-outline admin-btn" disabled={exporting || total === 0} onClick={onExport}>{exporting ? 'Preparing...' : 'Export CSV'}</button>
          <button type="button" className="admin-btn" onClick={() => setCreating((v) => !v)}>New shop</button>
        </div>
      </div>
      {error ? <div className="admin-alert is-error">{error}</div> : null}
      {creating ? <NewShopForm onCreated={() => void load()} onClose={() => setCreating(false)} /> : null}

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="lk-toolbar">
          <SearchField value={state.q} onChange={(q) => set({ q })} placeholder="Shop name or address" label="Search shops" />
          <label className="lk-field">Plan
            <select value={state.plan} onChange={(e) => set({ plan: e.target.value })}>
              <option value="">All</option><option value="TRIAL">Trial</option><option value="BASIC">Basic</option><option value="PRO">Pro</option>
            </select>
          </label>
          <label className="lk-field">Payments
            <select value={state.payments} onChange={(e) => set({ payments: e.target.value })}>
              <option value="">Any</option><option value="ready">Ready</option><option value="missing">Not configured</option>
            </select>
          </label>
          <label className="lk-field">Trial
            <select value={state.trial} onChange={(e) => set({ trial: e.target.value })}>
              <option value="">Any</option><option value="expiring">Ending within 7 days</option><option value="expired">Already ended</option>
            </select>
          </label>
          <label className="lk-field">Activity
            <select value={state.inactive} onChange={(e) => set({ inactive: e.target.value })}>
              <option value="">Any</option><option value="14">No orders in 14 days</option><option value="30">No orders in 30 days</option><option value="90">No orders in 90 days</option>
            </select>
          </label>
          <label className="lk-field">Feature
            <select value={state.feature} onChange={(e) => set({ feature: e.target.value, featureState: '' })}>
              <option value="">Any</option>
              {FEATURE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {state.feature ? (
            <label className="lk-field">is
              <select value={state.featureState} onChange={(e) => set({ featureState: e.target.value })}>
                <option value="">On (working or ready)</option><option value="working">Working</option><option value="ready">Ready, not used yet</option>
                <option value="setup">Needs setup</option><option value="problem">Has a problem</option><option value="off">Off</option>
              </select>
            </label>
          ) : null}
          <SortSelect value={state.sort} onChange={(sort) => set({ sort, dir: '' })} options={SORTS} />
        </div>
        <Chips
          value={view}
          onChange={setView}
          chips={[
            chip('', 'All', facets?.all),
            chip('ACTIVE', 'Active', facets?.ACTIVE),
            chip('TRIAL', 'Trial', facets?.TRIAL),
            chip('SUSPENDED', 'Suspended', facets?.SUSPENDED),
            chip('needs:problem', 'Has a problem', facets?.problems, 'danger'),
            chip('needs:basics', 'Missing a basic', facets?.missingBasics, 'warn'),
          ]}
        />
        {dirty ? <div style={{ marginTop: 10 }}><button type="button" className="admin-btn-ghost" onClick={reset}>Clear search and filters</button></div> : null}
      </div>

      {!shops ? <p>Loading...</p> : shops.length === 0 ? (
        <div className="admin-empty">{dirty ? 'No shops match those filters.' : 'No shops yet.'}</div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflowX: 'auto', opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
          <table className="admin-table">
            <thead>
              <tr>
                <SortHeader label="Shop" asc="name" desc="name" sort={state.sort} onSort={onSort} dir={dir as 'asc' | 'desc'} />
                <SortHeader label="Orders" asc="orders" desc="orders" sort={state.sort} onSort={onSort} dir={dir as 'asc' | 'desc'} />
                <SortHeader label="Revenue" asc="revenue" desc="revenue" sort={state.sort} onSort={onSort} dir={dir as 'asc' | 'desc'} />
                <SortHeader label="Last order" asc="lastOrder" desc="lastOrder" sort={state.sort} onSort={onSort} dir={dir as 'asc' | 'desc'} />
                <SortHeader label="Last login" asc="lastLogin" desc="lastLogin" sort={state.sort} onSort={onSort} dir={dir as 'asc' | 'desc'} />
                <SortHeader label="Set up" asc="setup" desc="setup" sort={state.sort} onSort={onSort} dir={dir as 'asc' | 'desc'} />
                <th>Features</th>
                <th>Plan</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.id}>
                  <td>
                    <Link href={`/admin/shops/${shop.id}`}><strong>{shop.name}</strong></Link>
                    <div style={{ fontSize: 12, ...muted }}>{shop.storefrontUrl.replace(/^https?:\/\//, '')}</div>
                  </td>
                  <td>{shop.orderCount}<div style={{ fontSize: 12, ...muted }}>{shop.productCount} products</div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{shop.currency} {shop.paidRevenue.toLocaleString()}</td>
                  <td style={shop.lastOrderAt ? undefined : muted}>{ago(shop.lastOrderAt)}</td>
                  <td style={shop.lastLoginAt ? undefined : muted}>{ago(shop.lastLoginAt)}</td>
                  <td><Meter coverage={shop.coverage} /></td>
                  <td><FeatureDots features={shop.features} /></td>
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
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="admin-btn admin-btn-sm" disabled={opening === shop.id} onClick={() => onViewAs(shop)} title="Open this shop's portal as its owner (a one-hour support session)">{opening === shop.id ? 'Opening...' : 'View as shop'}</button>{' '}
                    <a className="admin-btn-outline admin-btn admin-btn-sm" href={shop.storefrontUrl} target="_blank" rel="noopener noreferrer" title="Open the storefront">Storefront &#8599;</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Legend />

      <Pager variant="admin" page={state.page} pageSize={state.size} total={total} totalPages={totalPages} onPage={(page) => set({ page })} onSize={(size) => set({ size })} />
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
