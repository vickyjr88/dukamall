"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { AdSpendCard } from './ad-spend-card';
import { kes } from './format';

type Row = { sessions: number; viewedProduct: number; addedToCart: number; beganCheckout: number; tappedWhatsapp: number; whatsappOrders: number; orders: number; revenueKes: number };
type AdReturn = { source: string; spendKes: number; visits: number; whatsappTaps: number; orders: number; revenueKes: number };
type Funnel = {
  totals: Row;
  adReturn: AdReturn[];
  bySource: Array<Row & { source: string; medium: string }>;
  byDevice: Array<Row & { device: string }>;
  products: Array<{ slug: string; name: string; views: number; addedToCart: number; tappedWhatsapp: number; unitsSold: number; inStock: boolean | null }>;
  searches: Array<{ term: string; searches: number }>;
  orders: { placed: number; placedKes: number; linkedToVisits: number };
};

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 1 : 0)}%` : '–');

/** What each stage of a visit lost, in words, so the page says what to look at rather than leaving the reading to the owner. */
function insights(f: Funnel): string[] {
  const t = f.totals;
  if (t.sessions < 30) return [];
  const out: string[] = [];
  const left = 1 - t.viewedProduct / t.sessions;
  if (left > 0.6) out.push(`${(left * 100).toFixed(0)}% of visits leave without opening a single product. The first screen, the ad's promise and the page the ad lands on are worth a look.`);
  if (t.viewedProduct >= 20 && t.addedToCart / t.viewedProduct < 0.05 && t.tappedWhatsapp / t.viewedProduct < 0.05) {
    out.push(`Of ${t.viewedProduct} visits that opened a product, only ${t.addedToCart} added to cart and ${t.tappedWhatsapp} tapped WhatsApp. The product page is where people hesitate: price, sizes, delivery and trust.`);
  }
  if (t.addedToCart >= 10 && t.beganCheckout / t.addedToCart < 0.3) {
    out.push(`${t.addedToCart - t.beganCheckout} of ${t.addedToCart} carts never reached checkout. Delivery cost and the form are the usual reasons.`);
  }
  const mobile = f.byDevice.find((d) => d.device === 'mobile');
  const desktop = f.byDevice.find((d) => d.device === 'desktop');
  if (mobile && desktop && mobile.sessions >= 30 && desktop.sessions >= 30) {
    const m = (mobile.orders + mobile.tappedWhatsapp) / mobile.sessions;
    const d = (desktop.orders + desktop.tappedWhatsapp) / desktop.sessions;
    if (m < d * 0.6) out.push(`Phones bring ${pct(mobile.sessions, t.sessions)} of visits but convert far worse than desktop. Check the phone experience first.`);
  }
  const worst = f.bySource.filter((s) => s.sessions >= 30 && s.orders === 0 && s.tappedWhatsapp === 0)[0];
  if (worst) out.push(`${worst.source} (${worst.medium}) sent ${worst.sessions} visits and produced no orders and no WhatsApp taps.`);
  return out;
}

export function FunnelSection({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Funnel | null>(null);
  const [failed, setFailed] = useState(false);
  // Bumped when spend is added or removed, so the table below recounts.
  const [spendVersion, setSpendVersion] = useState(0);

  useEffect(() => {
    setData(null);
    setFailed(false);
    portalFetch(`/portal/analytics/funnel?${new URLSearchParams({ from, to }).toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, [from, to, spendVersion]);

  if (failed) return null;
  if (!data) return <div className="portal-card" style={{ marginBottom: 20 }}><h4>Visits to orders</h4><p>Loading...</p></div>;

  const t = data.totals;
  const steps = [
    { label: 'Visits', value: t.sessions },
    { label: 'Opened a product', value: t.viewedProduct },
    { label: 'Added to cart', value: t.addedToCart },
    { label: 'Began checkout', value: t.beganCheckout },
    { label: 'Tapped WhatsApp', value: t.tappedWhatsapp },
    { label: 'Ordered', value: t.orders },
  ];
  const notes = insights(data);

  return (
    <>
      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4>Visits to orders</h4>
        {t.sessions === 0 ? (
          <p style={{ color: 'var(--p-muted)' }}>
            No visits recorded in this range yet. Visits are counted from the moment this was switched on, so numbers appear as shoppers arrive.
          </p>
        ) : (
          <>
            <div className="funnel-steps">
              {steps.map((step) => (
                <div key={step.label} className="funnel-step">
                  <div className="funnel-step-head"><span>{step.label}</span><strong>{step.value.toLocaleString()}</strong></div>
                  <div className="funnel-bar"><span style={{ width: `${Math.max(2, (step.value / t.sessions) * 100)}%` }} /></div>
                  <small>{step.label === 'Visits' ? 'Every browser that arrived' : `${pct(step.value, t.sessions)} of visits`}</small>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, color: 'var(--p-muted)', marginTop: 12 }}>
              Visit to order: <strong>{pct(t.orders, t.sessions)}</strong>. Visit to an order or a WhatsApp tap: <strong>{pct(t.orders + t.tappedWhatsapp, t.sessions)}</strong>.
              {data.orders.placed > 0 ? ` ${data.orders.linkedToVisits} of the ${data.orders.placed} orders placed in this range can be traced to a visit; the rest were taken by phone, in person, or before tracking began.` : ''}
            </p>
            {notes.length ? (
              <ul className="funnel-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
            ) : null}
          </>
        )}
      </div>

      <div className="portal-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
        <h4>What ads return</h4>
        {data.adReturn.length === 0 ? (
          <p style={{ color: 'var(--p-muted)' }}>Enter what you spend on ads below to see what each platform costs per order and what it brings back.</p>
        ) : (
          <>
            <table className="portal-table">
              <thead><tr><th>Platform</th><th>Spent</th><th>Visits</th><th>Cost per visit</th><th>WhatsApp taps</th><th>Orders</th><th>Cost per order</th><th>Sales</th><th>Sales per KES 1</th></tr></thead>
              <tbody>
                {data.adReturn.map((a) => (
                  <tr key={a.source}>
                    <td><strong>{a.source}</strong></td>
                    <td>{kes(a.spendKes)}</td>
                    <td>{a.visits}</td>
                    <td>{a.visits ? kes(a.spendKes / a.visits) : '–'}</td>
                    <td>{a.whatsappTaps}{a.whatsappTaps > 0 ? <small style={{ color: 'var(--p-muted)' }}> ({kes(a.spendKes / a.whatsappTaps)} each)</small> : null}</td>
                    <td>{a.orders}</td>
                    <td>{a.orders ? kes(a.spendKes / a.orders) : '–'}</td>
                    <td>{kes(a.revenueKes)}</td>
                    <td>{a.spendKes > 0 ? (a.revenueKes / a.spendKes).toFixed(1) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 13, color: 'var(--p-muted)', marginTop: 10 }}>
              Counts visits from tagged ads and ad click ids only. Orders agreed over the phone, or by a customer who came back later through another door, are not counted, so treat these as the least the ads returned.
            </p>
          </>
        )}
        <AdSpendCard from={from} to={to} onChanged={() => setSpendVersion((v) => v + 1)} />
      </div>

      {t.sessions > 0 ? (
        <>
          <div className="portal-card" style={{ marginBottom: 20, overflowX: 'auto' }}>
            <h4>Where visits come from</h4>
            <table className="portal-table">
              <thead><tr><th>Source</th><th>Kind</th><th>Visits</th><th>Opened a product</th><th>Added to cart</th><th>WhatsApp taps</th><th>Orders</th><th>Revenue</th><th>Visit to order</th></tr></thead>
              <tbody>
                {data.bySource.map((s) => (
                  <tr key={`${s.source}|${s.medium}`}>
                    <td><strong>{s.source}</strong></td>
                    <td>{s.medium}</td>
                    <td>{s.sessions.toLocaleString()}</td>
                    <td>{pct(s.viewedProduct, s.sessions)}</td>
                    <td>{pct(s.addedToCart, s.sessions)}</td>
                    <td>{s.tappedWhatsapp}</td>
                    <td>{s.orders}</td>
                    <td>KES {s.revenueKes.toLocaleString()}</td>
                    <td>{pct(s.orders, s.sessions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 13, color: 'var(--p-muted)', marginTop: 10 }}>
              Tag each ad link with <code>?utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign=name</code> to see campaigns by name. Ads from Facebook, Instagram, TikTok and Google are recognised even without tags.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div className="portal-card" style={{ overflowX: 'auto' }}>
              <h4>Products people look at</h4>
              {data.products.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>No product views yet.</p> : (
                <table className="portal-table">
                  <thead><tr><th>Product</th><th>Views</th><th>Carts</th><th>WhatsApp</th><th>Sold</th></tr></thead>
                  <tbody>
                    {data.products.slice(0, 10).map((p) => (
                      <tr key={p.slug}>
                        <td>
                          {p.name}
                          {p.inStock === false ? <span className="portal-badge is-cancelled" style={{ marginLeft: 6 }}>Out of stock</span> : null}
                          {p.views >= 20 && p.addedToCart + p.tappedWhatsapp + p.unitsSold === 0 ? <span className="portal-badge" style={{ marginLeft: 6 }}>Looked at, never wanted</span> : null}
                        </td>
                        <td>{p.views}</td><td>{p.addedToCart}</td><td>{p.tappedWhatsapp}</td><td>{p.unitsSold}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="portal-card">
              <h4>What people search for</h4>
              {data.searches.length === 0 ? <p style={{ color: 'var(--p-muted)' }}>No searches yet.</p> : (
                <table className="portal-table">
                  <thead><tr><th>Words</th><th>Searches</th></tr></thead>
                  <tbody>{data.searches.map((s) => <tr key={s.term}><td>{s.term}</td><td>{s.searches}</td></tr>)}</tbody>
                </table>
              )}
              <h4 style={{ marginTop: 18 }}>Devices</h4>
              <table className="portal-table">
                <thead><tr><th>Device</th><th>Visits</th><th>Orders or WhatsApp</th></tr></thead>
                <tbody>
                  {data.byDevice.map((d) => (
                    <tr key={d.device}><td>{d.device}</td><td>{d.sessions}</td><td>{pct(d.orders + d.tappedWhatsapp, d.sessions)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
