"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '../../portal-api';
import {
  FULFILMENT_LABEL, FulfilmentBadge, MANUAL_METHODS, METHOD_LABEL, OrderDetail, PaymentBadge, PaymentMethod, SOURCE_LABEL,
  methodOf, money, when, whatsappLink,
} from '../../order-ui';

/**
 * One order, everything about it: what was bought and what it came to, who it's
 * for, how it was paid, where it is, and the team's own notes. Payment and
 * delivery are controlled separately -- an order is usually paid well before it
 * is delivered.
 */
export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('MPESA');
  const [payRef, setPayRef] = useState('');
  const [tracking, setTracking] = useState('');
  const [noteText, setNoteText] = useState('');

  async function load() {
    const res = await portalFetch(`/portal/orders/${params.id}`);
    if (res.status === 404) return setState('missing');
    if (!res.ok) return setState('failed');
    const data: OrderDetail = await res.json();
    setOrder(data);
    setTracking(data.trackingNote ?? '');
    setState('ready');
  }
  useEffect(() => { load().catch(() => setState('failed')); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Runs one change, then reloads the order so every card reflects it. */
  async function act(path: string, method: 'PATCH' | 'POST', body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await portalFetch(`/portal/orders/${params.id}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(Array.isArray(data?.message) ? data.message.join(' ') : data?.message || 'That didn’t work');
      }
      await load();
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return <p>Loading...</p>;
  if (state !== 'ready' || !order) {
    return <div className="portal-empty">{state === 'missing' ? 'That order doesn’t exist.' : 'Could not load this order.'} <Link href="/portal/orders">Back to orders</Link></div>;
  }

  const cancelled = order.status === 'CANCELLED';
  const method = methodOf(order);
  const customerName = `${order.firstName} ${order.lastName}`.trim();
  const notifyLink = whatsappLink(order.phone, `Hi ${order.firstName}, an update on order ${order.orderNumber}.`);

  return (
    <div>
      <p style={{ marginBottom: 14 }}><Link href="/portal/orders">&larr; All orders</Link></p>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ marginBottom: 6 }}>Order {order.orderNumber}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: 'var(--p-muted)' }}>
            <PaymentBadge status={order.status} />
            <FulfilmentBadge status={order.fulfilmentStatus} cancelled={cancelled} />
            <span>{SOURCE_LABEL[order.source]} &middot; {when(order.createdAt)}</span>
          </div>
        </div>
        {notifyLink ? <a href={notifyLink} target="_blank" rel="noopener noreferrer" className="portal-btn-outline portal-btn portal-btn-sm">Message on WhatsApp</a> : null}
      </div>

      {error ? <div className="portal-alert is-error">{error}</div> : null}

      <div className="po-grid">
        <div className="po-col">
          <div className="portal-card">
            <h4>Items</h4>
            <table className="portal-table">
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.variant.product.name}{l.variant.size ? <span style={{ color: 'var(--p-muted)' }}> &middot; {l.variant.size}</span> : null}<div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{l.variant.sku}</div></td>
                    <td>{l.quantity}</td>
                    <td>{money(l.priceKes)}</td>
                    <td style={{ textAlign: 'right' }}>{money(Number(l.priceKes) * l.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="po-totals" style={{ marginTop: 12 }}>
              <div><span>Subtotal</span><span>{money(order.subtotalKes)}</span></div>
              {Number(order.discountKes) > 0 ? <div style={{ color: 'var(--p-success)' }}><span>Discount{order.discount ? ` (${order.discount.code})` : ''}</span><span>-{money(order.discountKes)}</span></div> : null}
              <div><span>Delivery</span><span>{Number(order.shippingKes) > 0 ? money(order.shippingKes) : 'Free'}</span></div>
              <div className="is-total"><span>Total</span><span>{money(order.totalKes)}</span></div>
            </div>
          </div>

          <div className="portal-card">
            <h4>Notes</h4>
            <p style={{ fontSize: 12, color: 'var(--p-muted)', marginBottom: 10 }}>Only your team sees these.</p>
            {order.notes && order.notes.length ? (
              <ul className="po-notes">
                {order.notes.map((n) => (
                  <li key={n.id}><div className="meta">{n.authorName} &middot; {when(n.createdAt)}</div>{n.text}</li>
                ))}
              </ul>
            ) : null}
            <form
              onSubmit={async (e) => { e.preventDefault(); if (!noteText.trim()) return; if (await act('/notes', 'POST', { text: noteText })) setNoteText(''); }}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
            >
              <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} maxLength={2000} placeholder="e.g. Customer will collect on Friday" aria-label="Add a note" style={{ flex: 1 }} />
              <button type="submit" className="portal-btn" disabled={busy || !noteText.trim()}>Add</button>
            </form>
          </div>
        </div>

        <div className="po-col">
          <div className="portal-card">
            <h4>Payment</h4>
            <dl className="po-kv">
              <dt>Status</dt><dd><PaymentBadge status={order.status} /></dd>
              {method ? <><dt>Method</dt><dd>{METHOD_LABEL[method]}</dd></> : null}
              {order.paymentReference || order.paystackReference ? <><dt>Reference</dt><dd>{order.paymentReference ?? order.paystackReference}</dd></> : null}
              {order.paidAt ? <><dt>Paid</dt><dd>{when(order.paidAt)}</dd></> : null}
            </dl>

            {order.status === 'PENDING' ? (
              payOpen ? (
                <form
                  style={{ marginTop: 14 }}
                  onSubmit={async (e) => { e.preventDefault(); if (await act('/status', 'PATCH', { status: 'PAID', paymentMethod: payMethod, paymentReference: payRef.trim() || undefined })) { setPayOpen(false); setPayRef(''); } }}
                >
                  <div className="portal-field">
                    <label htmlFor="po-method">How was it paid?</label>
                    <select id="po-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                      {MANUAL_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </select>
                  </div>
                  <div className="portal-field">
                    <label htmlFor="po-ref">Reference (optional)</label>
                    <input id="po-ref" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="M-Pesa code, receipt no." maxLength={120} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--p-muted)', marginBottom: 10 }}>This takes the items out of stock and sends the customer their confirmation.</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="portal-btn" disabled={busy}>Mark as paid</button>
                    <button type="button" className="portal-btn-ghost" onClick={() => setPayOpen(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" className="portal-btn" style={{ marginTop: 14 }} onClick={() => setPayOpen(true)}>Mark as paid</button>
              )
            ) : null}

            {!cancelled ? (
              <button
                type="button"
                className="portal-btn-ghost"
                style={{ marginTop: 10, display: 'block' }}
                disabled={busy}
                onClick={() => {
                  const returnsStock = order.status === 'PAID';
                  if (window.confirm(`Cancel order ${order.orderNumber}?${returnsStock ? ' The items go back into stock.' : ''}`)) void act('/status', 'PATCH', { status: 'CANCELLED' });
                }}
              >
                Cancel this order
              </button>
            ) : null}
          </div>

          {!cancelled ? (
            <div className="portal-card">
              <h4>Delivery</h4>
              <dl className="po-kv" style={{ marginBottom: 12 }}>
                <dt>Status</dt><dd><FulfilmentBadge status={order.fulfilmentStatus} /></dd>
                {order.shippedAt ? <><dt>Shipped</dt><dd>{when(order.shippedAt)}</dd></> : null}
                {order.deliveredAt ? <><dt>Delivered</dt><dd>{when(order.deliveredAt)}</dd></> : null}
              </dl>
              <div className="portal-field">
                <label htmlFor="po-tracking">Courier / tracking note</label>
                <input id="po-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={300} placeholder="e.g. Sendy rider, waybill SND-77" />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {order.fulfilmentStatus === 'UNFULFILLED' ? (
                  <button type="button" className="portal-btn" disabled={busy} onClick={() => void act('/fulfilment', 'PATCH', { status: 'SHIPPED', trackingNote: tracking })}>Mark as shipped</button>
                ) : null}
                {order.fulfilmentStatus === 'SHIPPED' ? (
                  <>
                    <button type="button" className="portal-btn" disabled={busy} onClick={() => void act('/fulfilment', 'PATCH', { status: 'DELIVERED', trackingNote: tracking })}>Mark as delivered</button>
                    <button type="button" className="portal-btn-outline portal-btn" disabled={busy} onClick={() => void act('/fulfilment', 'PATCH', { status: 'SHIPPED', trackingNote: tracking })}>Save note</button>
                  </>
                ) : null}
                {order.fulfilmentStatus !== 'UNFULFILLED' ? (
                  <button type="button" className="portal-btn-ghost" disabled={busy} onClick={() => void act('/fulfilment', 'PATCH', { status: order.fulfilmentStatus === 'DELIVERED' ? 'SHIPPED' : 'UNFULFILLED' })}>Undo</button>
                ) : null}
              </div>
              {order.status === 'PENDING' ? <p style={{ fontSize: 12, color: 'var(--p-muted)', marginTop: 10 }}>Not paid yet &mdash; fine for pay-on-delivery. Mark it paid once the money arrives.</p> : null}
            </div>
          ) : null}

          <div className="portal-card">
            <h4>Customer</h4>
            <dl className="po-kv">
              <dt>Name</dt><dd>{customerName || '—'}</dd>
              <dt>Phone</dt><dd>{order.phone ?? '—'}</dd>
              <dt>Email</dt><dd>{order.email ?? '—'}</dd>
              <dt>Address</dt><dd>{order.shippingAddress ?? '—'}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
