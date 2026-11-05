"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { kes, pct1 } from './format';

type Buyers = {
  lapseDays: number; buyers: number; newBuyers: number; returningBuyers: number; repeatRate: number; repeatRevenueShare: number;
  averageOrderKes: number; averageLifetimeKes: number; averageOrdersPerBuyer: number; unrecognisedOrders: number;
  lapsed: Array<{ name: string; phone: string | null; orders: number; spendKes: number; lastOrder: string; daysAgo: number }>; lapsedCount: number;
  top: Array<{ name: string; phone: string | null; orders: number; spentInPeriodKes: number; lifetimeKes: number }>;
};

/** A message that is a real reason to come back, not "we miss you". Opens WhatsApp ready to send; the owner presses send. */
function winBackLink(phone: string, name: string) {
  const first = name.split(' ')[0] || 'there';
  const text = `Hi ${first}, it has been a while since your last order with us. We have new stock in, would you like to see what's new?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function BuyersSection({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Buyers | null>(null);
  const [days, setDays] = useState(60);

  useEffect(() => {
    setData(null);
    portalFetch(`/portal/analytics/buyers?${new URLSearchParams({ from, to, lapseDays: String(days) }).toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [from, to, days]);

  if (!data) return <div className="portal-card" style={{ marginBottom: 20 }}><h4>Who buys</h4><p>Loading...</p></div>;

  return (
    <>
      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4>Who buys, and who comes back</h4>
        {data.buyers === 0 ? <p style={{ color: 'var(--p-muted)' }}>No orders in this period.</p> : (
          <div className="money-grid">
            <div><span>Buyers</span><strong>{data.buyers}</strong><small>{data.newBuyers} new, {data.returningBuyers} came back</small></div>
            <div><span>Came back</span><strong>{pct1(data.repeatRate)}</strong><small>Of buyers, had bought before this period</small></div>
            <div><span>Money from repeat buyers</span><strong>{pct1(data.repeatRevenueShare)}</strong><small>Of what was taken in</small></div>
            <div><span>Average order</span><strong>{kes(data.averageOrderKes)}</strong><small>This period</small></div>
            <div><span>Each buyer is worth</span><strong>{kes(data.averageLifetimeKes)}</strong><small>{data.averageOrdersPerBuyer.toFixed(1)} orders on average, all time</small></div>
          </div>
        )}
        {data.unrecognisedOrders > 0 ? (
          <p className="money-note">
            {data.unrecognisedOrders} order{data.unrecognisedOrders === 1 ? ' has' : 's have'} no phone number or email, so {data.unrecognisedOrders === 1 ? 'it' : 'they'} cannot be matched to a returning buyer. Always take a phone number.
          </p>
        ) : null}
      </div>

      <div className="portal-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <h4>Gone quiet</h4>
          <label style={{ fontSize: 13, color: 'var(--p-muted)' }}>
            No order for{' '}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
        </div>
        {data.lapsed.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>Nobody who has bought has been away that long.</p> : (
          <>
            <p style={{ marginTop: 0 }}>
              {data.lapsedCount} buyer{data.lapsedCount === 1 ? ' has' : 's have'} not ordered in {data.lapseDays} days. Those who bought more than once are first; a message costs nothing.
            </p>
            <table className="portal-table">
              <thead><tr><th>Buyer</th><th>Orders</th><th>Spent</th><th>Last order</th><th></th></tr></thead>
              <tbody>
                {data.lapsed.map((b) => (
                  <tr key={`${b.phone}-${b.lastOrder}-${b.name}`}>
                    <td>{b.name}</td>
                    <td>{b.orders}</td>
                    <td>{kes(b.spendKes)}</td>
                    <td>{b.daysAgo} days ago</td>
                    <td>{b.phone ? <a href={winBackLink(b.phone, b.name)} target="_blank" rel="noreferrer">Message on WhatsApp</a> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}
