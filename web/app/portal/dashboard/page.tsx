"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';
import { useSession } from '../portal-session';
import { PlanNotice, SetupChecklist, useOverview } from '../setup-panel';
import { Kpi, previousLabel } from '../analytics/kpi';
import { kes, pct1 } from '../analytics/format';

type RecentOrder = { id: string; orderNumber: string; status: 'PENDING' | 'PAID' | 'CANCELLED'; firstName: string; lastName: string; totalKes: string; createdAt: string };
type Attention = {
  unpaidOver2Days: { orders: number; amountKes: number }; toShip: number; newLeads: number; soldOut: number; lowStock: number; noPhoto: number;
  lowStockProducts: { id: string; name: string; imageUrl: string | null; stock: number }[];
};
type Totals = { orders: number; soldKes: number; paidKes: number; visits: number; averageOrderKes: number; conversion: number | null };
type Overview = {
  current: Totals; change: Record<string, number | null>; series: { date: string; orders: number; soldKes: number; visits: number }[];
  topProducts: { id: string; name: string; imageUrl: string | null; units: number; revenueKes: number }[];
};

const BADGE_CLASS: Record<RecentOrder['status'], string> = { PENDING: 'is-pending', PAID: 'is-paid', CANCELLED: 'is-cancelled' };
const PERIODS = [{ days: 1, label: 'Today' }, { days: 7, label: '7 days' }, { days: 30, label: '30 days' }];

// The shop's day is a Nairobi day (UTC+3, no daylight saving).
const nairobiDate = (offsetDays = 0) => new Date(Date.now() + 3 * 3600 * 1000 - offsetDays * 86400000).toISOString().slice(0, 10);

export default function DashboardPage() {
  const { ready, isOwner } = useSession();
  const setup = useOverview();
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[] | null>(null);

  useEffect(() => {
    if (!ready) return;
    portalFetch('/portal/dashboard/attention').then((r) => (r.ok ? r.json() : null)).then(setAttention).catch(() => {});
    portalFetch('/portal/orders?pageSize=6').then((r) => r.json()).then((d) => setRecentOrders(d.orders)).catch(() => setRecentOrders([]));
  }, [ready]);

  // Takings are owner-only on the API (a cashier would get a 403), so a cashier's dashboard is the day's work.
  useEffect(() => {
    if (!ready || !isOwner) return;
    let live = true;
    setOverview(null);
    portalFetch(`/portal/analytics/overview?from=${nairobiDate(days - 1)}&to=${nairobiDate()}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setOverview(d); }).catch(() => {});
    return () => { live = false; };
  }, [ready, isOwner, days]);

  const prev = previousLabel(days);
  const c = overview?.current;
  const items: { count: number; text: string; href: string; tone?: 'warn' | 'danger' }[] = attention ? [
    { count: attention.unpaidOver2Days.orders, text: `unpaid for over 2 days (${kes(attention.unpaidOver2Days.amountKes)})`, href: '/portal/orders?payment=PENDING&sort=oldest', tone: 'warn' as const },
    { count: attention.toShip, text: 'waiting to be shipped', href: '/portal/orders?fulfilment=UNFULFILLED&sort=oldest', tone: 'warn' as const },
    { count: attention.newLeads, text: 'new leads to follow up', href: '/portal/leads?status=NEW', tone: 'warn' as const },
    { count: attention.lowStock, text: 'products running low', href: '/portal/products?view=low&sort=stock_asc' },
    { count: attention.soldOut, text: 'products sold out', href: '/portal/products?view=out' },
    { count: attention.noPhoto, text: 'products without a photo', href: '/portal/products?view=no_photo', tone: 'danger' as const },
  ].filter((i) => i.count > 0) : [];

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3>Dashboard</h3>
        {isOwner ? (
          <div className="lk-chips" style={{ margin: 0 }} role="group" aria-label="Period">
            {PERIODS.map((p) => <button key={p.days} type="button" aria-pressed={days === p.days} className={`lk-chip${days === p.days ? ' is-on' : ''}`} onClick={() => setDays(p.days)}>{p.label}</button>)}
          </div>
        ) : null}
      </div>

      {isOwner && setup ? <PlanNotice plan={setup.plan} /> : null}

      {isOwner ? (
        <div className="kpi-grid">
          <Kpi label="Sales" value={c ? kes(c.soldKes) : '–'} hint={c ? `${kes(c.paidKes)} paid` : undefined} change={overview?.change.soldKes} current={c?.soldKes ?? 0} previousLabel={c ? prev : undefined} spark={overview?.series} sparkKey="soldKes" href="/portal/analytics" />
          <Kpi label="Orders" value={c ? c.orders.toLocaleString() : '–'} change={overview?.change.orders} current={c?.orders ?? 0} previousLabel={c ? prev : undefined} spark={overview?.series} sparkKey="orders" color="#0f7a40" href="/portal/orders" />
          <Kpi label="Visits" value={c ? c.visits.toLocaleString() : '–'} hint={c && c.conversion !== null ? `${pct1(c.conversion)} ordered` : undefined} change={overview?.change.visits} current={c?.visits ?? 0} previousLabel={c ? prev : undefined} spark={overview?.series} sparkKey="visits" color="#7c3aed" href="/portal/analytics" />
          <Kpi label="Average order" value={c ? kes(c.averageOrderKes) : '–'} change={overview?.change.averageOrderKes} current={c?.averageOrderKes ?? 0} previousLabel={c ? prev : undefined} />
        </div>
      ) : null}

      <div className="dash-grid">
        <div className="portal-card">
          <h4>Needs your attention</h4>
          {!attention ? <p>Loading...</p> : items.length === 0 ? (
            <p style={{ color: 'var(--p-success)', fontWeight: 600 }}>All caught up. Nothing is waiting on you.</p>
          ) : (
            <ul className="dash-todo">
              {items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href}><span className={`dash-count${i.tone ? ` is-${i.tone}` : ''}`}>{i.count.toLocaleString()}</span><span>{i.text}</span><span className="dash-go" aria-hidden="true">&rarr;</span></Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="portal-card">
          <h4>Promote today</h4>
          <p style={{ fontSize: 13, color: 'var(--p-muted)', marginBottom: 12 }}>A few minutes of sharing brings the next orders.</p>
          <div className="dash-actions">
            <Link href="/portal/status-kit" className="portal-btn">Today&apos;s WhatsApp Status</Link>
            <Link href="/portal/share" className="portal-btn portal-btn-outline">Share a product</Link>
            <Link href="/portal/marketing" className="portal-btn portal-btn-outline">All marketing tools</Link>
          </div>
        </div>
      </div>

      {isOwner && setup ? <div style={{ marginTop: 16 }}><SetupChecklist items={setup.checklist} /></div> : null}

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="portal-card">
          <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Recent orders
            <Link href="/portal/orders" style={{ fontSize: 12, textTransform: 'none', fontWeight: 400 }}>View all &rarr;</Link>
          </h4>
          {!recentOrders ? <p>Loading...</p> : recentOrders.length === 0 ? (
            <p style={{ color: 'var(--p-muted)' }}>No orders yet.</p>
          ) : (
            <table className="portal-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/portal/orders/${o.id}`}><strong>{o.orderNumber}</strong></Link><div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{new Date(o.createdAt).toLocaleDateString()}</div></td>
                    <td>{o.firstName} {o.lastName}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>KES {Number(o.totalKes).toLocaleString()}</td>
                    <td><span className={`portal-badge ${BADGE_CLASS[o.status]}`}>{o.status === 'PENDING' ? 'UNPAID' : o.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="portal-card">
          {isOwner ? (
            <>
              <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Best sellers
                <Link href="/portal/products?sort=sold" style={{ fontSize: 12, textTransform: 'none', fontWeight: 400 }}>All products &rarr;</Link>
              </h4>
              {!overview ? <p>Loading...</p> : overview.topProducts.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>No sales in this period.</p> : (
                <ul className="dash-products">
                  {overview.topProducts.slice(0, 5).map((p) => (
                    <li key={p.id}>
                      {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <span className="an-noimg" />}
                      <Link href={`/portal/products/${p.id}`}><strong>{p.name}</strong></Link>
                      <span>{p.units} sold<br /><em>{kes(p.revenueKes)}</em></span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h4>Running low</h4>
              <LowStock attention={attention} />
            </>
          )}
        </div>
      </div>

      {isOwner ? (
        <div className="portal-card" style={{ marginTop: 16 }}>
          <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Running low
            <Link href="/portal/products?view=low&sort=stock_asc" style={{ fontSize: 12, textTransform: 'none', fontWeight: 400 }}>See all &rarr;</Link>
          </h4>
          <LowStock attention={attention} />
        </div>
      ) : null}
    </div>
  );
}

function LowStock({ attention }: { attention: Attention | null }) {
  if (!attention) return <p>Loading...</p>;
  if (attention.lowStockProducts.length === 0) return <p style={{ color: 'var(--p-muted)' }}>Nothing is running low.</p>;
  return (
    <ul className="dash-products">
      {attention.lowStockProducts.map((p) => (
        <li key={p.id}>
          {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <span className="an-noimg" />}
          <Link href={`/portal/products/${p.id}`}><strong>{p.name}</strong></Link>
          <span className="pl-stock is-low">{p.stock} left</span>
        </li>
      ))}
    </ul>
  );
}
