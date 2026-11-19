"use client";

import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { portalFetch } from '../portal-api';
import { Kpi, previousLabel } from './kpi';
import { kes, pct1 } from './format';

type Row = { date: string; orders: number; soldKes: number; paidKes: number; visits: number };
type Totals = { orders: number; soldKes: number; paidKes: number; cancelled: number; units: number; visits: number; whatsappTaps: number; averageOrderKes: number; conversion: number | null };
type Overview = {
  range: { from: string; to: string; bucket: 'day' | 'week' | 'month' };
  current: Totals; previous: Totals;
  change: Record<'soldKes' | 'paidKes' | 'orders' | 'units' | 'visits' | 'averageOrderKes' | 'whatsappTaps', number | null>;
  series: Row[];
  byStatus: { status: string; orders: number; amountKes: number }[];
  bySource: { source: string; orders: number; soldKes: number }[];
  byWeekday: { dow: number; label: string; orders: number; soldKes: number }[];
  byHour: { hour: number; orders: number }[];
  topProducts: { id: string; name: string; slug: string; imageUrl: string | null; units: number; revenueKes: number; views: number }[];
};

const SOURCE_LABEL: Record<string, string> = { WEBSITE: 'Website', WHATSAPP: 'WhatsApp', IN_PERSON: 'In person', OTHER: 'Other' };
const STATUS_LABEL: Record<string, string> = { PAID: 'Paid', PENDING: 'Unpaid', CANCELLED: 'Cancelled' };
const METRICS = [
  { key: 'soldKes', label: 'Sales', money: true }, { key: 'paidKes', label: 'Paid', money: true },
  { key: 'orders', label: 'Orders', money: false }, { key: 'visits', label: 'Visits', money: false },
] as const;

function dayLabel(date: string, bucket: 'day' | 'week' | 'month') {
  const d = new Date(`${date}T00:00:00Z`);
  if (bucket === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function OverviewSection({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('soldKes');
  const [when, setWhen] = useState<'weekday' | 'hour'>('weekday');

  useEffect(() => {
    let live = true;
    setError(false);
    portalFetch(`/portal/analytics/overview?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [from, to]);

  const days = useMemo(() => Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1), [from, to]);
  if (error) return <div className="portal-alert is-error">Could not load the overview. Try again in a moment.</div>;
  if (!data) return <p>Loading...</p>;

  const { current: c, change } = data;
  const prev = previousLabel(days);
  const money = METRICS.find((m) => m.key === metric)!.money;
  const quiet = c.orders === 0 && c.visits === 0;
  const maxWeekday = Math.max(1, ...data.byWeekday.map((w) => w.orders));
  const best = data.byWeekday.reduce((a, b) => (b.orders > a.orders ? b : a), data.byWeekday[0]);
  const bestHour = data.byHour.reduce((a, b) => (b.orders > a.orders ? b : a), data.byHour[0]);

  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Sales" value={kes(c.soldKes)} hint={`${kes(c.paidKes)} paid`} change={change.soldKes} current={c.soldKes} previousLabel={prev} spark={data.series} sparkKey="soldKes" />
        <Kpi label="Orders" value={c.orders.toLocaleString()} hint={c.cancelled ? `${c.cancelled} cancelled` : `${c.units} items sold`} change={change.orders} current={c.orders} previousLabel={prev} spark={data.series} sparkKey="orders" color="#0f7a40" />
        <Kpi label="Average order" value={kes(c.averageOrderKes)} change={change.averageOrderKes} current={c.averageOrderKes} previousLabel={prev} />
        <Kpi label="Visits" value={c.visits.toLocaleString()} hint={c.whatsappTaps ? `${c.whatsappTaps} WhatsApp taps` : undefined} change={change.visits} current={c.visits} previousLabel={prev} spark={data.series} sparkKey="visits" color="#7c3aed" />
        <Kpi label="Visits that ordered" value={pct1(c.conversion)} hint={c.conversion === null ? 'Needs visits to measure' : `${c.orders} orders from ${c.visits} visits`} />
      </div>

      {quiet ? <div className="portal-card portal-empty" style={{ marginBottom: 16 }}>No orders or visits in this range. Try a longer one, or share something from <a href="/portal/marketing">Marketing</a>.</div> : null}

      <div className="portal-card" style={{ marginBottom: 16 }}>
        <div className="an-head">
          <h4>Trend</h4>
          <div className="lk-chips" style={{ margin: 0 }} role="group" aria-label="Measure">
            {METRICS.map((m) => (
              <button key={m.key} type="button" aria-pressed={metric === m.key} className={`lk-chip${metric === m.key ? ' is-on' : ''}`} onClick={() => setMetric(m.key)}>{m.label}</button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--p-line)" />
            <XAxis dataKey="date" tickFormatter={(d) => dayLabel(String(d), data.range.bucket)} fontSize={11} tickLine={false} axisLine={false} minTickGap={22} />
            <YAxis fontSize={11} width={money ? 56 : 36} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => (money && Number(v) >= 1000 ? `${Math.round(Number(v) / 1000)}k` : String(v))} />
            <Tooltip cursor={{ fill: 'rgba(36,56,168,0.06)' }} labelFormatter={(d) => `${data.range.bucket === 'week' ? 'Week of ' : ''}${dayLabel(String(d), data.range.bucket)}`} formatter={(v) => [money ? kes(Number(v)) : Number(v).toLocaleString(), METRICS.find((m) => m.key === metric)!.label]} />
            <Bar dataKey={metric} fill="var(--p-primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
        <p className="an-note">By {data.range.bucket}, in Nairobi time. Cancelled orders are left out. {data.range.bucket !== 'day' ? 'Pick a shorter range to see days.' : ''}</p>
      </div>

      <div className="an-grid">
        <div className="portal-card">
          <div className="an-head">
            <h4>When people buy</h4>
            <div className="lk-chips" style={{ margin: 0 }} role="group">
              <button type="button" aria-pressed={when === 'weekday'} className={`lk-chip${when === 'weekday' ? ' is-on' : ''}`} onClick={() => setWhen('weekday')}>Day</button>
              <button type="button" aria-pressed={when === 'hour'} className={`lk-chip${when === 'hour' ? ' is-on' : ''}`} onClick={() => setWhen('hour')}>Hour</button>
            </div>
          </div>
          {c.orders === 0 ? <p className="an-note">No orders yet in this range.</p> : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={(when === 'weekday' ? data.byWeekday : data.byHour) as Array<Record<string, number | string>>} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke="var(--p-line)" />
                  <XAxis dataKey={when === 'weekday' ? 'label' : 'hour'} fontSize={11} tickLine={false} axisLine={false} interval={when === 'hour' ? 2 : 0} tickFormatter={(h) => (when === 'hour' ? `${h}h` : String(h))} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'rgba(36,56,168,0.06)' }} formatter={(v) => [`${v} order${Number(v) === 1 ? '' : 's'}`, '']} />
                  <Bar dataKey="orders" fill="var(--p-success)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
              <p className="an-note">
                {when === 'weekday'
                  ? `${best.label} is the busiest day (${Math.round((best.orders / Math.max(1, c.orders)) * 100)}% of orders). Post your best offer the evening before.`
                  : `Most orders come around ${bestHour.hour}:00. Send your Status and posts shortly before then.`}
              </p>
            </>
          )}
        </div>

        <div className="portal-card">
          <h4>Where orders come from</h4>
          {data.bySource.length === 0 ? <p className="an-note">No orders yet in this range.</p> : (
            <ul className="an-bars">
              {data.bySource.map((s) => (
                <li key={s.source}>
                  <div className="an-bars-row"><span>{SOURCE_LABEL[s.source] ?? s.source}</span><strong>{kes(s.soldKes)}</strong></div>
                  <div className="an-bar"><span style={{ width: `${Math.max(3, (s.orders / Math.max(1, c.orders)) * 100)}%` }} /></div>
                  <div className="an-sub">{s.orders} order{s.orders === 1 ? '' : 's'}</div>
                </li>
              ))}
            </ul>
          )}
          <h4 style={{ marginTop: 18 }}>Payment</h4>
          <div className="an-pills">
            {['PAID', 'PENDING', 'CANCELLED'].map((st) => {
              const r = data.byStatus.find((x) => x.status === st);
              return <div key={st} className={`an-pill is-${st.toLowerCase()}`}><strong>{r?.orders ?? 0}</strong><span>{STATUS_LABEL[st]}</span><em>{kes(r?.amountKes ?? 0)}</em></div>;
            })}
          </div>
        </div>
      </div>

      <div className="portal-card" style={{ marginTop: 16, marginBottom: 16 }}>
        <div className="an-head"><h4>Best sellers</h4><a href="/portal/products?sort=sold" style={{ fontSize: 12 }}>All products &rarr;</a></div>
        {data.topProducts.length === 0 ? <p className="an-note">No sales in this range.</p> : (
          <table className="portal-table">
            <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Sold</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }} title="Product page views in the same range">Views</th></tr></thead>
            <tbody>
              {data.topProducts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a href={`/portal/products/${p.id}`} className="an-product">
                      {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <span className="an-noimg" />}
                      <strong>{p.name}</strong>
                    </a>
                  </td>
                  <td style={{ textAlign: 'right' }}>{p.units}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{kes(p.revenueKes)}</td>
                  <td style={{ textAlign: 'right' }}>{p.views || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
