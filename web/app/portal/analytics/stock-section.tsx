"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { kes, pct1 } from './format';

type Stock = {
  deadDays: number;
  onHand: { units: number; retailValueKes: number; costValueKes: number; productsWithoutCost: number };
  deadStock: { count: number; tiedUpKes: number; items: Array<{ slug: string; name: string; units: number; valueKes: number; basis: 'cost' | 'price'; daysSinceSale: number | null; onShelfDays: number }> };
  runningLow: Array<{ slug: string; name: string; units: number; soldInPeriod: number; coverDays: number | null }>;
  missedDemand: Array<{ slug: string; name: string; views: number; carts: number; whatsapp: number }>;
  earners: Array<{ slug: string; name: string; unitsSold: number; revenueKes: number; profitKes: number | null; marginRate: number | null }>;
};

export function StockSection({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Stock | null>(null);
  const [days, setDays] = useState(60);

  useEffect(() => {
    setData(null);
    portalFetch(`/portal/analytics/stock?${new URLSearchParams({ from, to, deadDays: String(days) }).toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [from, to, days]);

  if (!data) return <div className="portal-card" style={{ marginBottom: 20 }}><h4>Products and stock</h4><p>Loading...</p></div>;

  return (
    <>
      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4>Stock on the shelf</h4>
        <div className="money-grid">
          <div><span>Units</span><strong>{data.onHand.units.toLocaleString()}</strong><small>Active products only</small></div>
          <div><span>At selling price</span><strong>{kes(data.onHand.retailValueKes)}</strong><small>What it would bring in</small></div>
          <div>
            <span>At cost</span>
            <strong>{data.onHand.costValueKes > 0 ? kes(data.onHand.costValueKes) : '–'}</strong>
            <small>{data.onHand.productsWithoutCost > 0 ? `${data.onHand.productsWithoutCost} product${data.onHand.productsWithoutCost === 1 ? '' : 's'} in stock without a cost` : 'Every product in stock has a cost'}</small>
          </div>
        </div>
      </div>

      <div className="portal-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h4>Not selling</h4>
          <label style={{ fontSize: 13, color: 'var(--p-muted)' }}>
            Not sold for{' '}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
        </div>
        {data.deadStock.count === 0 ? (
          <p style={{ color: 'var(--p-muted)' }}>Nothing in stock has gone {data.deadDays} days without a sale.</p>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{kes(data.deadStock.tiedUpKes)}</strong> is tied up in {data.deadStock.count} product{data.deadStock.count === 1 ? ' that has' : 's that have'} not sold in {data.deadDays} days.
              A discount, a bundle or an ad on these turns shelf space back into cash.
            </p>
            <table className="portal-table">
              <thead><tr><th>Product</th><th>Units</th><th>Tied up</th><th>Last sold</th></tr></thead>
              <tbody>
                {data.deadStock.items.map((d) => (
                  <tr key={d.slug}>
                    <td><Link href={`/shop/${d.slug}`} target="_blank">{d.name}</Link></td>
                    <td>{d.units}</td>
                    <td>{kes(d.valueKes)}<small style={{ color: 'var(--p-muted)' }}> at {d.basis}</small></td>
                    <td>{d.daysSinceSale === null ? `Never (on sale ${d.onShelfDays} days)` : `${d.daysSinceSale} days ago`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="portal-card" style={{ overflowX: 'auto' }}>
          <h4>Running low on fast sellers</h4>
          {data.runningLow.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>No steady seller is close to running out.</p> : (
            <table className="portal-table">
              <thead><tr><th>Product</th><th>Left</th><th>Sold</th><th>Lasts about</th></tr></thead>
              <tbody>
                {data.runningLow.map((r) => (
                  <tr key={r.slug}><td>{r.name}</td><td>{r.units}</td><td>{r.soldInPeriod}</td><td>{r.coverDays} days</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="portal-card" style={{ overflowX: 'auto' }}>
          <h4>Sold out, still wanted</h4>
          {data.missedDemand.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>No sold-out product is getting looks or messages.</p> : (
            <>
              <table className="portal-table">
                <thead><tr><th>Product</th><th>Views</th><th>Carts</th><th>WhatsApp</th></tr></thead>
                <tbody>
                  {data.missedDemand.map((r) => (
                    <tr key={r.slug}><td>{r.name}</td><td>{r.views}</td><td>{r.carts}</td><td>{r.whatsapp}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="money-note">People are asking for these and cannot buy them. Restocking the top of this list is the cheapest sale you can win.</p>
            </>
          )}
        </div>
      </div>

      <div className="portal-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
        <h4>What earns the most</h4>
        {data.earners.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>No sales in this period.</p> : (
          <table className="portal-table">
            <thead><tr><th>Product</th><th>Sold</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead>
            <tbody>
              {data.earners.map((e) => (
                <tr key={e.slug}>
                  <td>{e.name}</td><td>{e.unitsSold}</td><td>{kes(e.revenueKes)}</td>
                  <td>{e.profitKes === null ? <span style={{ color: 'var(--p-muted)' }}>no cost saved</span> : kes(e.profitKes)}</td>
                  <td>{pct1(e.marginRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
