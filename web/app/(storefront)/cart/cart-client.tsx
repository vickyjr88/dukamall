"use client";

import { useEffect, useState } from 'react';
import { useCart } from '@/app/lib/cart';
import { ShopInfo } from '@/app/lib/api';
import { useShopFetch } from '@/app/lib/shop-id-context';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useCustomerFetch } from '@/app/lib/use-customer-fetch';

export function CartClient({ shopInfo }: { shopInfo: ShopInfo }) {
  const cart = useCart();
  const shopFetch = useShopFetch();
  const customerFetch = useCustomerFetch();
  const { customer } = useCustomerAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  // Logged-in checkout: pre-fill the shopper's email so they don't retype it
  // -- checkout itself still links the order to their account via the
  // Authorization header customerFetch attaches, not this field.
  useEffect(() => {
    if (customer) setForm((f) => ({ ...f, email: f.email || customer.email }));
  }, [customer]);

  if (!cart.ready) return null;
  if (cart.lines.length === 0) return <main className="shop-container"><p>Your cart is empty.</p></main>;

  function buildWhatsappMessage() {
    const lines = [`Hello ${shopInfo.name}, I would like to order:`];
    for (const line of cart.lines) {
      if (line.isCustomSize) {
        lines.push(`- ${line.quantity} x ${line.name} (size ${line.size} -- not listed, please confirm availability/price)`);
        continue;
      }
      lines.push(`- ${line.quantity} x ${line.name} (${line.size}) - ${shopInfo.currency} ${(line.priceKes * line.quantity).toLocaleString()}`);
    }
    lines.push('');
    lines.push(`Subtotal: ${shopInfo.currency} ${cart.subtotal.toLocaleString()}`);
    lines.push('');
    const name = `${form.firstName} ${form.lastName}`.trim();
    if (name) lines.push(`Name: ${name}`);
    if (form.phone.trim()) lines.push(`Phone: ${form.phone.trim()}`);
    return lines.join('\n');
  }

  /** Records the order as a lead even if the shopper never sends the message. */
  function recordWhatsappLead() {
    void shopFetch('/cart-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'WHATSAPP_ORDER',
        lines: cart.lines.map((line) => ({
          variantId: line.variantId ?? undefined,
          name: line.name,
          size: line.size,
          quantity: line.quantity,
          priceKes: line.priceKes,
          isCustomSize: line.isCustomSize || undefined,
        })),
        customerName: `${form.firstName} ${form.lastName}`.trim() || undefined,
        customerPhone: form.phone.trim() || undefined,
        customerEmail: form.email.trim() || undefined,
        message: buildWhatsappMessage(),
      }),
    }).catch(() => {
      // Best-effort: the shopper's own WhatsApp order still goes out even if
      // recording it here fails.
    });
  }

  function onWhatsapp() {
    recordWhatsappLead();
    const phone = (shopInfo.whatsappNumber || '').replace(/[^\d]/g, '');
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsappMessage())}`
      : null;
    if (url) window.open(url, '_blank', 'noopener');
  }

  async function onCheckout() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await customerFetch('/checkout', {
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

      {shopInfo.whatsappNumber ? (
        <button type="button" className="btn btn-accent" onClick={onWhatsapp} style={{ marginTop: 8, display: 'block', width: '100%' }}>
          Buy via WhatsApp instead
        </button>
      ) : null}
    </main>
  );
}
