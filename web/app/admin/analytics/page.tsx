"use client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { adminFetch } from '../admin-api';

type Granularity = 'day' | 'week' | 'month';
type TrendPoint = { date: string; revenueKes: number; orderCount: number };
type LeaderboardRow = {
  shopId: string; shopName: string; shopSlug: string; status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED';
  revenueKes: number; orderCount: number; growthRate: number | null;
};
type LifecycleFunnel = {
  byStatus: { status: string; count: number }[];
  byBillingPlan: { billingPlan: string; count: number }[];
  statusTransitions: { from: string; to: string; count: number }[];
  trialToPaidCount: number;
};
type ShopChurn = {
  newShops: { id: string; name: string; slug: string; createdAt: string }[];
  newShopCount: number;
  churnedShops: { id: string; name: string; slug: string }[];
  churnedShopCount: number;
  inactivityThresholdDays: number;
};

const BADGE_CLASS: Record<LeaderboardRow['status'], string> = { TRIAL: 'is-trial', ACTIVE: 'is-active', SUSPENDED: 'is-suspended' };

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function useAdminColors() {
  const [colors, setColors] = useState({ primary: '#b45309', success: '#0f7a40', warn: '#a85b00', line: '#e7e5e4' });
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    setColors({
      primary: read('--a-primary', '#b45309'),
      success: read('--a-success', '#0f7a40'),
      warn: read('--a-warn', '#a85b00'),
      line: read('--a-line', '#e7e5e4'),
    });
  }, []);
  return colors;
}

export default function AdminAnalyticsPage() {
  const colors = useAdminColors();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(toDateInput(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(toDateInput(today));
  const [granularity, setGranularity] = useState<Granularity>('day');

  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[] | null>(null);
  const [funnel, setFunnel] = useState<LifecycleFunnel | null>(null);
  const [churn, setChurn] = useState<ShopChurn | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ from, to });
    adminFetch(`/admin/analytics/revenue-trend?${query.toString()}&granularity=${granularity}`).then((r) => r.json()).then(setTrend);
    adminFetch(`/admin/analytics/shop-leaderboard?${query.toString()}`).then((r) => r.json()).then(setLeaderboard);
    adminFetch(`/admin/analytics/lifecycle-funnel?${query.toString()}`).then((r) => r.json()).then(setFunnel);
    adminFetch(`/admin/analytics/shop-churn?${query.toString()}`).then((r) => r.json()).then(setChurn);
  }, [from, to, granularity]);

  function setPreset(days: number) {
    const end = new Date();
    setTo(toDateInput(end));
    setFrom(toDateInput(new Date(end.getTime() - days * 24 * 60 * 60 * 1000)));
  }

  const totalRevenue = trend?.reduce((sum, p) => sum + p.revenueKes, 0) ?? 0;

  return (
    <div>
      <div className="admin-page-head"><h3>Analytics</h3></div>

      <div className="admin-card" style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase' }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase' }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} max={toDateInput(today)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--a-muted)', textTransform: 'uppercase' }}>
          Granularity
          <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="admin-btn-outline admin-btn admin-btn-sm" onClick={() => setPreset(7)}>7d</button>
          <button type="button" className="admin-btn-outline admin-btn admin-btn-sm" onClick={() => setPreset(30)}>30d</button>
          <button type="button" className="admin-btn-outline admin-btn admin-btn-sm" onClick={() => setPreset(90)}>90d</button>
        </div>
      </div>

      <div className="admin-stat-row">
        <div className="admin-stat">
          <div className="label">Revenue in range</div>
          <div className="value">KES {totalRevenue.toLocaleString()}</div>
        </div>
        <div className="admin-stat">
          <div className="label">New shops</div>
          <div className="value">{churn ? churn.newShopCount : '–'}</div>
        </div>
        <div className="admin-stat">
          <div className="label">Shops gone quiet</div>
          <div className={`value${churn && churn.churnedShopCount > 0 ? ' is-danger' : ''}`}>{churn ? churn.churnedShopCount : '–'}</div>
        </div>
        <div className="admin-stat">
          <div className="label">Trial &rarr; paid</div>
          <div className="value">{funnel ? funnel.trialToPaidCount : '–'}</div>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h4>Platform revenue trend</h4>
        {!trend ? <p>Loading...</p> : trend.length === 0 ? (
          <p style={{ color: 'var(--a-muted)' }}>No paid orders in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} width={70} tickFormatter={(v) => `${Number(v).toLocaleString()}`} />
              <Tooltip formatter={(value, name) => name === 'revenueKes' ? [`KES ${Number(value ?? 0).toLocaleString()}`, 'Revenue'] : [value, 'Orders']} />
              <Legend />
              <Line type="monotone" dataKey="revenueKes" name="Revenue (KES)" stroke={colors.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="orderCount" name="Orders" stroke={colors.success} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h4>Shop leaderboard</h4>
        {!leaderboard ? <p>Loading...</p> : leaderboard.length === 0 ? (
          <p style={{ color: 'var(--a-muted)' }}>No shops yet.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Shop</th><th>Status</th><th>Revenue</th><th>Orders</th><th>Growth vs. prior period</th></tr></thead>
            <tbody>
              {leaderboard.slice(0, 20).map((row) => (
                <tr key={row.shopId}>
                  <td><Link href={`/admin/shops/${row.shopId}`}>{row.shopName}</Link> <span style={{ color: 'var(--a-muted)' }}>({row.shopSlug})</span></td>
                  <td><span className={`admin-badge ${BADGE_CLASS[row.status]}`}>{row.status}</span></td>
                  <td>KES {row.revenueKes.toLocaleString()}</td>
                  <td>{row.orderCount}</td>
                  <td>
                    {row.growthRate === null ? (
                      <span style={{ color: 'var(--a-muted)' }}>&mdash;</span>
                    ) : (
                      <span style={{ color: row.growthRate >= 0 ? 'var(--a-success)' : 'var(--a-danger)' }}>
                        {row.growthRate >= 0 ? '+' : ''}{(row.growthRate * 100).toFixed(0)}%
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="admin-card">
          <h4>Shop lifecycle</h4>
          {!funnel ? <p>Loading...</p> : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={funnel.byStatus} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={12} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" fontSize={12} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" name="Shops" fill={colors.primary} />
                </BarChart>
              </ResponsiveContainer>
              {funnel.statusTransitions.length > 0 ? (
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  {funnel.statusTransitions.map((t, i) => (
                    <div key={i} style={{ color: 'var(--a-muted)' }}>
                      {t.count} shop{t.count === 1 ? '' : 's'} moved {t.from} &rarr; {t.to} this period
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--a-muted)', marginTop: 12 }}>No status changes in this range.</p>
              )}
            </>
          )}
        </div>
        <div className="admin-card">
          <h4>New &amp; churned shops</h4>
          {!churn ? <p>Loading...</p> : (
            <>
              <p style={{ fontSize: 13, color: 'var(--a-muted)', marginBottom: 12 }}>
                &ldquo;Churned&rdquo; means a shop had a paid order before, but none in the last {churn.inactivityThresholdDays} days.
              </p>
              <div style={{ display: 'flex', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--a-muted)', textTransform: 'uppercase' }}>New this period</div>
                  {churn.newShops.length === 0 ? <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>None</p> : (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {churn.newShops.slice(0, 8).map((s) => <li key={s.id}><Link href={`/admin/shops/${s.id}`}>{s.name}</Link></li>)}
                    </ul>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--a-danger)', textTransform: 'uppercase' }}>Gone quiet</div>
                  {churn.churnedShops.length === 0 ? <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>None</p> : (
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
                      {churn.churnedShops.slice(0, 8).map((s) => <li key={s.id}><Link href={`/admin/shops/${s.id}`}>{s.name}</Link></li>)}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
