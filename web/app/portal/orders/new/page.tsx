"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '../../portal-api';
import { useSession } from '../../portal-session';
import { MANUAL_METHODS, METHOD_LABEL, OrderSource, PaymentMethod, money } from '../../order-ui';

type SearchVariant = { id: string; size: string | null; name: string; priceKes: string; stockOnHand: number; isActive: boolean };
type SearchProduct = { id: string; name: string; imageUrls: string[]; variants: SearchVariant[] };
type Line = { variantId: string; label: string; price: number; quantity: number; stock: number | null };
type Settings = { deliveryFeeKes: number; freeDeliveryOverKes: number | null };

const SOURCES: { value: Extract<OrderSource, 'WHATSAPP' | 'IN_PERSON' | 'OTHER'>; label: string }[] = [
  { value: 'WHATSAPP', label: 'WhatsApp' }, { value: 'IN_PERSON', label: 'In person' }, { value: 'OTHER', label: 'Other' },
];

/**
 * Record a sale that didn't come through the website -- a WhatsApp order, a
 * walk-in -- so it counts toward stock, revenue and the customer's history like
 * any other. Prices come from the catalogue on the server; what's shown here is
 * a preview. Arriving from a lead (?lead=<id>) pre-fills the customer and items.
 */
export default function NewOrderPage() {
  const router = useRouter();
  const { isOwner } = useSession();

  const [settings, setSettings] = useState<Settings>({ deliveryFeeKes: 0, freeDeliveryOverKes: null });
  const [leadId, setLeadId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [source, setSource] = useState<'WHATSAPP' | 'IN_PERSON' | 'OTHER'>('WHATSAPP');
  const [shipping, setShipping] = useState('0');
  const [shippingTouched, setShippingTouched] = useState(false);
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('MPESA');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchProduct[] | null>(null);
  const searchSeq = useRef(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalFetch('/portal/settings').then((r) => (r.ok ? r.json() : null)).then((s) => {
      if (s) setSettings({ deliveryFeeKes: Number(s.deliveryFeeKes ?? 0), freeDeliveryOverKes: s.freeDeliveryOverKes ?? null });
    }).catch(() => {});

    const id = new URLSearchParams(window.location.search).get('lead');
    if (!id) return;
    portalFetch(`/portal/cart-leads/${id}`).then(async (res) => {
      if (!res.ok) return;
      const lead = await res.json();
      setLeadId(lead.id);
      const [firstName, ...rest] = (lead.customerName ?? '').trim().split(/\s+/);
      setFirst(firstName ?? ''); setLast(rest.join(' '));
      setPhone(lead.customerPhone ?? ''); setEmail(lead.customerEmail ?? ''); setAddress(lead.shippingAddress ?? '');
      setSource('WHATSAPP');
      const matched = (lead.lines as any[]).filter((l) => l.variantId);
      setLines(matched.map((l) => ({ variantId: l.variantId, label: `${l.name} · ${l.size}`, price: Number(l.priceKes), quantity: l.quantity, stock: null })));
      // A size the customer typed themselves has no variant to sell, so it can't
      // become a line; it goes in the note so nothing they asked for is lost.
      const custom = (lead.lines as any[]).filter((l) => !l.variantId);
      if (custom.length) {
        setNote(`Customer also asked for (not in the size list): ${custom.map((l) => `${l.quantity} x ${l.name} (${l.size})`).join(', ')}`);
      }
    }).catch(() => {});
  }, []);

  // Product search, debounced; a stale response never overwrites a newer one.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      const res = await portalFetch(`/portal/products?search=${encodeURIComponent(q)}&pageSize=8&status=active`);
      if (!res.ok || seq !== searchSeq.current) return;
      setResults((await res.json()).products);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const subtotal = useMemo(() => lines.reduce((n, l) => n + l.price * l.quantity, 0), [lines]);
  const discountAmount = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const total = Math.max(0, subtotal - discountAmount) + (Number(shipping) || 0);

  // Prefill delivery from the shop's rule until someone edits it by hand.
  useEffect(() => {
    if (shippingTouched) return;
    const after = Math.max(0, subtotal - discountAmount);
    const free = settings.freeDeliveryOverKes && after >= settings.freeDeliveryOverKes;
    setShipping(String(lines.length === 0 || free ? 0 : settings.deliveryFeeKes));
  }, [subtotal, discountAmount, settings, shippingTouched, lines.length]);

  function addVariant(product: SearchProduct, v: SearchVariant) {
    setLines((current) => {
      const i = current.findIndex((l) => l.variantId === v.id);
      if (i >= 0) return current.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...current, { variantId: v.id, label: `${product.name}${v.size ? ` · ${v.size}` : ''}`, price: Number(v.priceKes), quantity: 1, stock: v.stockOnHand }];
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!first.trim()) return setError('Enter the customer’s name.');
    if (lines.length === 0) return setError('Add at least one item.');
    setSaving(true);
    try {
      const res = await portalFetch('/portal/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: first.trim(), lastName: last.trim() || undefined, phone: phone.trim() || undefined,
          email: email.trim() || undefined, shippingAddress: address.trim() || undefined,
          lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          source, shippingKes: Number(shipping) || 0,
          ...(isOwner && discountAmount > 0 ? { discountKes: discountAmount } : {}),
          ...(paid ? { markPaid: true, paymentMethod: method, paymentReference: reference.trim() || undefined } : {}),
          note: note.trim() || undefined,
          leadId: leadId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data?.message) ? data.message.join(' ') : data?.message || 'Could not create the order');
      router.push(`/portal/orders/${data.id}`);
    } catch (err: any) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p style={{ marginBottom: 14 }}><Link href="/portal/orders">&larr; All orders</Link></p>
      <div className="portal-page-head"><h3>New order</h3></div>
      {leadId ? <div className="portal-alert is-success">Created from a lead &mdash; the customer and items are filled in. Check them, then create the order.</div> : null}
      {error ? <div className="portal-alert is-error" role="alert">{error}</div> : null}

      <div className="po-grid">
        <div className="po-col">
          <div className="portal-card">
            <h4>Items</h4>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your products by name or SKU..." aria-label="Search products" />
            {results ? (
              results.length === 0 ? <p style={{ fontSize: 13, color: 'var(--p-muted)', marginTop: 8 }}>No products match.</p> : (
                <div className="po-results">
                  {results.map((p) => (
                    <div key={p.id} className="po-result">
                      <strong>{p.name}</strong>
                      <div className="sizes">
                        {p.variants.filter((v) => v.isActive).map((v) => (
                          <button type="button" key={v.id} className={v.stockOnHand <= 0 ? 'is-out' : ''} onClick={() => addVariant(p, v)} title={v.stockOnHand <= 0 ? 'Out of stock' : `${v.stockOnHand} in stock`}>
                            {v.size ?? v.name} &middot; {money(v.priceKes)}{v.stockOnHand <= 0 ? ' (0)' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {lines.length > 0 ? (
              <table className="portal-table" style={{ marginTop: 14 }}>
                <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.variantId}>
                      <td>{l.label}{l.stock !== null && l.quantity > l.stock ? <div style={{ fontSize: 12, color: 'var(--p-warn)' }}>Only {Math.max(0, l.stock)} in stock</div> : null}</td>
                      <td><input type="number" min={1} value={l.quantity} aria-label="Quantity" style={{ width: 70 }} onChange={(e) => setLines((c) => c.map((x) => (x.variantId === l.variantId ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))} /></td>
                      <td>{money(l.price)}</td>
                      <td style={{ textAlign: 'right' }}>{money(l.price * l.quantity)}</td>
                      <td><button type="button" className="portal-btn-ghost" onClick={() => setLines((c) => c.filter((x) => x.variantId !== l.variantId))}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p style={{ fontSize: 13, color: 'var(--p-muted)', marginTop: 10 }}>Search above and tap a size to add it.</p>}
            <p style={{ fontSize: 12, color: 'var(--p-muted)', marginTop: 8 }}>Prices are taken from your catalogue when the order is created.</p>
          </div>

          <div className="portal-card">
            <h4>Customer</h4>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="portal-field" style={{ flex: '1 1 180px' }}><label htmlFor="no-first">First name</label><input id="no-first" value={first} onChange={(e) => setFirst(e.target.value)} maxLength={80} /></div>
              <div className="portal-field" style={{ flex: '1 1 180px' }}><label htmlFor="no-last">Last name</label><input id="no-last" value={last} onChange={(e) => setLast(e.target.value)} maxLength={80} /></div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="portal-field" style={{ flex: '1 1 180px' }}><label htmlFor="no-phone">Phone</label><input id="no-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} placeholder="254712345678" /></div>
              <div className="portal-field" style={{ flex: '1 1 180px' }}><label htmlFor="no-email">Email (optional)</label><input id="no-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><span className="hint">If given, they get an order confirmation.</span></div>
            </div>
            <div className="portal-field"><label htmlFor="no-address">Delivery address</label><textarea id="no-address" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={500} /></div>
          </div>
        </div>

        <div className="po-col">
          <div className="portal-card">
            <h4>Summary</h4>
            <div className="portal-field">
              <label htmlFor="no-source">Where did it come from?</label>
              <select id="no-source" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="portal-field">
              <label htmlFor="no-ship">Delivery fee (KES)</label>
              <input id="no-ship" type="number" min={0} step="0.01" value={shipping} onChange={(e) => { setShipping(e.target.value); setShippingTouched(true); }} />
              {!shippingTouched && settings.deliveryFeeKes > 0 ? <span className="hint">From your delivery settings{settings.freeDeliveryOverKes ? `, free over ${money(settings.freeDeliveryOverKes)}` : ''}.</span> : null}
            </div>
            {isOwner ? (
              <div className="portal-field">
                <label htmlFor="no-discount">Discount (KES, optional)</label>
                <input id="no-discount" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
            ) : null}
            <div className="po-totals">
              <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
              {discountAmount > 0 ? <div style={{ color: 'var(--p-success)' }}><span>Discount</span><span>-{money(discountAmount)}</span></div> : null}
              <div><span>Delivery</span><span>{money(Number(shipping) || 0)}</span></div>
              <div className="is-total"><span>Total</span><span>{money(total)}</span></div>
            </div>
          </div>

          <div className="portal-card">
            <h4>Payment</h4>
            <label className="pe-check">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
              <span><strong>Already paid</strong><br /><span className="hint">Takes the items out of stock now. Leave off for pay-on-delivery and mark it paid later.</span></span>
            </label>
            {paid ? (
              <>
                <div className="portal-field">
                  <label htmlFor="no-method">Paid by</label>
                  <select id="no-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {MANUAL_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                  </select>
                </div>
                <div className="portal-field">
                  <label htmlFor="no-ref">Reference (optional)</label>
                  <input id="no-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="M-Pesa code, receipt no." />
                </div>
              </>
            ) : null}
          </div>

          <div className="portal-card">
            <h4>Note</h4>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} placeholder="Only your team sees this" aria-label="Note" />
          </div>
        </div>
      </div>

      <div className="pe-actionbar">
        <span style={{ fontSize: 13, color: 'var(--p-muted)' }}>{lines.length} item{lines.length === 1 ? '' : 's'} &middot; {money(total)}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/portal/orders" className="portal-btn-outline portal-btn">Cancel</Link>
          <button type="submit" className="portal-btn" disabled={saving}>{saving ? 'Creating...' : 'Create order'}</button>
        </div>
      </div>
    </form>
  );
}
