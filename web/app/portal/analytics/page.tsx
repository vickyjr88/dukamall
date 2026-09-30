"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { portalFetch } from '../portal-api';

type Granularity = 'day' | 'week' | 'month';
type TrendPoint = { date: string; revenueKes: number; orderCount: number };
type BreakdownRow = { name: string; revenueKes: number; unitsSold: number };
type CustomerInsights = {
  distinctCustomers: number; newCustomers: number; returningCustomers: number; repeatPurchaseRate: number;
  topCustomers: { id: string; name: string; email: string | null; phone: string | null; revenueKes: number; orderCount: number }[];
};
type LeadConversion = {
  totalLeads: number; converted: number; conversionRate: number; convertedRevenueKes: number;
  whatsappOrder: { total: number; converted: number }; abandonedCart: { total: number; converted: number };
};

const PIE_COLORS = ['#2438a8', '#0f7a40', '#a85b00', '#b3261e', '#6b7280', '#7c3aed', '#0891b2', '#be185d'];

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Reads the portal's own --p-* CSS tokens at render time rather than
// hardcoding hex here a second time -- if the design system's palette ever
// changes, these charts follow it instead of drifting out of sync.
function usePortalColors() {
  const [colors, setColors] = useState({ primary: '#2438a8', success: '#0f7a40', warn: '#a85b00', muted: '#6b7280', line: '#e5e7eb' });
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    setColors({
      primary: read('--p-primary', '#2438a8'),
      success: read('--p-success', '#0f7a40'),
      warn: read('--p-warn', '#a85b00'),
      muted: read('--p-muted', '#6b7280'),
      line: read('--p-line', '#e5e7eb'),
    });
  }, []);
  return colors;
}

export default function AnalyticsPage() {
  const colors = usePortalColors();
  const today = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(toDateInput(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)));
  const [to, setTo] = useState(toDateInput(today));
  const [granularity, setGranularity] = useState<Granularity>('day');

  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [breakdown, setBreakdown] = useState<{ byCategory: BreakdownRow[]; byBrand: BreakdownRow[] } | null>(null);
  const [customers, setCustomers] = useState<CustomerInsights | null>(null);
  const [leads, setLeads] = useState<LeadConversion | null>(null);

  useEffect(() => {
    const query = new URLSearchParams({ from, to });
    portalFetch(`/portal/analytics/revenue-trend?${query.toString()}&granularity=${granularity}`).then((r) => r.json()).then(setTrend);
    portalFetch(`/portal/analytics/sales-breakdown?${query.toString()}`).then((r) => r.json()).then(setBreakdown);
    portalFetch(`/portal/analytics/customers?${query.toString()}`).then((r) => r.json()).then(setCustomers);
    portalFetch(`/portal/analytics/lead-conversion?${query.toString()}`).then((r) => r.json()).then(setLeads);
  }, [from, to, granularity]);

  const totalRevenue = trend?.reduce((sum, p) => sum + p.revenueKes, 0) ?? 0;
  const totalOrders = trend?.reduce((sum, p) => sum + p.orderCount, 0) ?? 0;

  function setPreset(days: number) {
    const end = new Date();
    setTo(toDateInput(end));
    setFrom(toDateInput(new Date(end.getTime() - days * 24 * 60 * 60 * 1000)));
  }

  return (
    <div>
      <div className="portal-page-head"><h3>Analytics</h3></div>

      <div className="portal-card" style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} max={toDateInput(today)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
          Granularity
          <select value={granularity} onChange={(e) => setGranularity(e.target.value as Granularity)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => setPreset(7)}>7d</button>
          <button type="button" className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => setPreset(30)}>30d</button>
          <button type="button" className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => setPreset(90)}>90d</button>
        </div>
      </div>

      <div className="portal-stat-row">
        <div className="portal-stat">
          <div className="label">Revenue in range</div>
          <div className="value">KES {totalRevenue.toLocaleString()}</div>
        </div>
        <div className="portal-stat">
          <div className="label">Paid orders</div>
          <div className="value">{totalOrders}</div>
        </div>
        <div className="portal-stat">
          <div className="label">Repeat purchase rate</div>
          <div className="value">{customers ? `${(customers.repeatPurchaseRate * 100).toFixed(0)}%` : '–'}</div>
        </div>
        <div className="portal-stat">
          <div className="label">Lead conversion</div>
          <div className="value">{leads ? `${(leads.conversionRate * 100).toFixed(0)}%` : '–'}</div>
        </div>
      </div>

      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4>Revenue trend</h4>
        {!trend ? <p>Loading...</p> : trend.length === 0 ? (
          <p style={{ color: 'var(--p-muted)' }}>No paid orders in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend}>
              <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} width={70} tickFormatter={(v) => `${Number(v).toLocaleString()}`} />
              <Tooltip formatter={(value, name) => name === 'revenueKes' ? [`KES ${Number(value ?? 0).toLocaleString()}`, 'Revenue'] : [value, 'Orders']} />
              <Legend />
              <Line type="monotone" dataKey="revenueKes" name="Revenue (KES)" stroke={colors.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="orderCount" name="Orders" stroke={colors.success} strokeWidth={2} dot={false} yAxisId={0} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="portal-card">
          <h4>Sales by category</h4>
          {!breakdown ? <p>Loading...</p> : breakdown.byCategory.length === 0 ? (
            <p style={{ color: 'var(--p-muted)' }}>No paid orders in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={breakdown.byCategory} dataKey="revenueKes" nameKey="name" outerRadius={80} label={(d: any) => d.name}>
                  {breakdown.byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => `KES ${Number(value ?? 0).toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="portal-card">
          <h4>Sales by brand</h4>
          {!breakdown ? <p>Loading...</p> : breakdown.byBrand.length === 0 ? (
            <p style={{ color: 'var(--p-muted)' }}>No paid orders in this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={breakdown.byBrand.slice(0, 8)} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid stroke={colors.line} strokeDasharray="3 3" />
                <XAxis type="number" fontSize={12} tickFormatter={(v) => `${Number(v).toLocaleString()}`} />
                <YAxis type="category" dataKey="name" fontSize={12} width={90} />
                <Tooltip formatter={(value) => `KES ${Number(value ?? 0).toLocaleString()}`} />
                <Bar dataKey="revenueKes" name="Revenue (KES)" fill={colors.primary} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="portal-card">
          <h4>Customers</h4>
          {!customers ? <p>Loading...</p> : (
            <>
              <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
                <div><div style={{ fontSize: 12, color: 'var(--p-muted)' }}>New</div><div style={{ fontSize: 22, fontWeight: 700 }}>{customers.newCustomers}</div></div>
                <div><div style={{ fontSize: 12, color: 'var(--p-muted)' }}>Returning</div><div style={{ fontSize: 22, fontWeight: 700 }}>{customers.returningCustomers}</div></div>
              </div>
              {customers.topCustomers.length === 0 ? (
                <p style={{ color: 'var(--p-muted)' }}>No customer orders in this range.</p>
              ) : (
                <table className="portal-table">
                  <thead><tr><th>Customer</th><th>Orders</th><th>Revenue</th></tr></thead>
                  <tbody>
                    {customers.topCustomers.slice(0, 5).map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{c.orderCount}</td>
                        <td>KES {c.revenueKes.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
        <div className="portal-card">
          <h4>Lead conversion</h4>
          {!leads ? <p>Loading...</p> : (
            <table className="portal-table">
              <thead><tr><th>Source</th><th>Leads</th><th>Converted</th><th>Rate</th></tr></thead>
              <tbody>
                <tr>
                  <td>WhatsApp order</td>
                  <td>{leads.whatsappOrder.total}</td>
                  <td>{leads.whatsappOrder.converted}</td>
                  <td>{leads.whatsappOrder.total > 0 ? `${((leads.whatsappOrder.converted / leads.whatsappOrder.total) * 100).toFixed(0)}%` : '–'}</td>
                </tr>
                <tr>
                  <td>Abandoned cart</td>
                  <td>{leads.abandonedCart.total}</td>
                  <td>{leads.abandonedCart.converted}</td>
                  <td>{leads.abandonedCart.total > 0 ? `${((leads.abandonedCart.converted / leads.abandonedCart.total) * 100).toFixed(0)}%` : '–'}</td>
                </tr>
                <tr style={{ fontWeight: 600 }}>
                  <td>Total</td>
                  <td>{leads.totalLeads}</td>
                  <td>{leads.converted}</td>
                  <td>{leads.totalLeads > 0 ? `${(leads.conversionRate * 100).toFixed(0)}%` : '–'}</td>
                </tr>
              </tbody>
            </table>
          )}
          {leads && leads.converted > 0 ? (
            <p style={{ fontSize: 13, color: 'var(--p-muted)', marginTop: 10 }}>
              KES {leads.convertedRevenueKes.toLocaleString()} in revenue traced back to a lead.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
