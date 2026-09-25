"use client";

import { useState } from 'react';
import { useCart } from '@/app/lib/cart';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

export function CartClient() {
  const cart = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  if (!cart.ready) return null;
  if (cart.lines.length === 0) return <main className="shop-container"><p>Your cart is empty.</p></main>;

  async function onCheckout() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: cart.payableLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Checkout failed');
      if (data.online && data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else {
        cart.clear();
        alert('Order placed. We will contact you to arrange payment.');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shop-container">
      <h1>Your cart</h1>
      {cart.lines.map((line) => (
        <div key={line.id} className={`cart-line${line.isCustomSize ? ' cart-line--custom' : ''}`}>
          {line.imageUrl ? <img src={line.imageUrl} alt="" /> : null}
          <div style={{ flex: 1 }}>
            <div>{line.name}</div>
            <div style={{ color: 'var(--shop-muted)', fontSize: 13 }}>
              {line.size}
              {line.isCustomSize ? ' -- not listed, we will confirm on WhatsApp' : ` -- KES ${line.priceKes.toLocaleString()} each`}
            </div>
          </div>
          <input
            type="number"
            min={1}
            value={line.quantity}
            onChange={(e) => cart.setQuantity(line.id, Number(e.target.value))}
            style={{ width: 50 }}
          />
          <button onClick={() => cart.remove(line.id)}>Remove</button>
        </div>
      ))}

      {cart.hasCustomSizeLine ? (
        <p style={{ fontSize: 13, color: 'var(--shop-muted)' }}>
          A size you typed isn&apos;t included in the total below -- send your order on WhatsApp to confirm it.
        </p>
      ) : null}

      <p><strong>Subtotal: KES {cart.subtotal.toLocaleString()}</strong></p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
        <input placeholder="First name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
        <input placeholder="Last name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
      </div>

      {error ? <p style={{ color: 'red' }}>{error}</p> : null}

      <button className="btn" disabled={submitting} onClick={onCheckout} style={{ marginTop: 12 }}>
        {submitting ? 'Processing...' : `Pay KES ${cart.subtotal.toLocaleString()}`}
      </button>
    </main>
  );
}
