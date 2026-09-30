"use client";

import { useEffect, useState } from 'react';
import { useCart } from '@/app/lib/cart';
import { ShopInfo } from '@/app/lib/api';
import { useShopFetch } from '@/app/lib/shop-id-context';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useCustomerFetch } from '@/app/lib/use-customer-fetch';
import { WhatsAppIcon } from '@/app/whatsapp-icon';

export function CartClient({ shopInfo }: { shopInfo: ShopInfo }) {
  const cart = useCart();
  const shopFetch = useShopFetch();
  const customerFetch = useCustomerFetch();
  const { customer } = useCustomerAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', deliveryAddress: '', deliveryCity: '' });
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; discountKes: number } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  // Logged-in checkout: pre-fill the shopper's email so they don't retype it
  // -- checkout itself still links the order to their account via the
  // Authorization header customerFetch attaches, not this field.
  useEffect(() => {
    if (customer) setForm((f) => ({ ...f, email: f.email || customer.email }));
  }, [customer]);

  if (!cart.ready) return null;
  if (cart.lines.length === 0) {
    return (
      <main className="shop-container shop-section">
        <div className="empty-state">
          <h3>Your cart is empty</h3>
          <p>Add something you love and it will show up here.</p>
          <a href="/" className="btn btn-primary">Continue shopping</a>
        </div>
      </main>
    );
  }

  // Address + city combined into the one shippingAddress string both the
  // backend's CheckoutDto and RecordCartLeadDto already accept -- neither
  // needs a separate city column, and splitting it in the form just makes
  // it easier for a shopper to leave the city off by accident.
  function buildShippingAddress() {
    const parts = [form.deliveryAddress.trim(), form.deliveryCity.trim()].filter(Boolean);
    return parts.length ? parts.join(', ') : undefined;
  }

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
    const address = buildShippingAddress();
    if (address) lines.push(`Deliver to: ${address}`);
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
        shippingAddress: buildShippingAddress(),
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

  async function onApplyDiscount() {
    setDiscountError(null);
    setAppliedDiscount(null);
    const code = discountCodeInput.trim();
    if (!code) return;
    setApplyingDiscount(true);
    try {
      const res = await shopFetch(`/shop/discounts/validate?code=${encodeURIComponent(code)}&subtotalKes=${cart.subtotal}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'This code is not valid');
      setAppliedDiscount({ code: data.code, discountKes: data.discountKes });
    } catch (e: any) {
      setDiscountError(e.message);
    } finally {
      setApplyingDiscount(false);
    }
  }

  const total = Math.max(0, cart.subtotal - (appliedDiscount?.discountKes ?? 0));

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
          shippingAddress: buildShippingAddress(),
          discountCode: appliedDiscount?.code,
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
    <main className="shop-container shop-section">
      <div className="shop-section-head">
        <div>
          <span className="eyebrow">{cart.count} item{cart.count === 1 ? '' : 's'}</span>
          <h1>Your cart</h1>
        </div>
      </div>

      <div className="cart-layout">
        <div>
          {cart.lines.map((line) => (
            <div key={line.id} className={`cart-line${line.isCustomSize ? ' cart-line--custom' : ''}`}>
              {line.imageUrl ? <img src={line.imageUrl} alt="" /> : <div style={{ width: 84, height: 84, background: 'var(--shop-surface)', borderRadius: 'var(--shop-radius-sm)' }} />}
              <div>
                <div className="name">{line.name}</div>
                <div className="meta">
                  {line.size}
                  {line.isCustomSize ? ' -- not listed, we will confirm on WhatsApp' : ` -- KES ${line.priceKes.toLocaleString()} each`}
                </div>
                <button
                  type="button"
                  onClick={() => cart.remove(line.id)}
                  style={{ marginTop: 8, fontSize: 'var(--shop-text-xs)', color: 'var(--shop-muted)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Remove
                </button>
              </div>
              <div className="qty-stepper">
                <button type="button" onClick={() => cart.setQuantity(line.id, line.quantity - 1)} aria-label="Decrease quantity">&minus;</button>
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => cart.setQuantity(line.id, Number(e.target.value))}
                />
                <button type="button" onClick={() => cart.setQuantity(line.id, line.quantity + 1)} aria-label="Increase quantity">+</button>
              </div>
            </div>
          ))}
        </div>

        <div className="summary-card">
          {cart.hasCustomSizeLine ? (
            <p style={{ fontSize: 'var(--shop-text-xs)', color: 'var(--shop-muted)', marginBottom: 'var(--shop-space-4)' }}>
              A size you typed isn&apos;t included in the total below -- send your order on WhatsApp to confirm it.
            </p>
          ) : null}

          <div className="summary-row"><span>Subtotal</span><span>KES {cart.subtotal.toLocaleString()}</span></div>
          {appliedDiscount ? (
            <div className="summary-row" style={{ color: 'var(--shop-success, #0f7a40)' }}>
              <span>Discount ({appliedDiscount.code})</span><span>-KES {appliedDiscount.discountKes.toLocaleString()}</span>
            </div>
          ) : null}
          <div className="summary-row is-total"><span>Total</span><span>KES {total.toLocaleString()}</span></div>

          <div style={{ display: 'flex', gap: 8, marginTop: 'var(--shop-space-3)' }}>
            <input
              placeholder="Discount code"
              value={discountCodeInput}
              onChange={(e) => setDiscountCodeInput(e.target.value.toUpperCase())}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn btn-outline" onClick={onApplyDiscount} disabled={applyingDiscount || !discountCodeInput.trim()}>
              {applyingDiscount ? 'Checking...' : 'Apply'}
            </button>
          </div>
          {discountError ? <p style={{ color: 'var(--shop-danger)', fontSize: 'var(--shop-text-xs)', marginTop: 4 }}>{discountError}</p> : null}

          <div style={{ marginTop: 'var(--shop-space-5)' }}>
            <div className="form-field">
              <label htmlFor="cart-first-name">First name</label>
              <input id="cart-first-name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div className="form-field">
              <label htmlFor="cart-last-name">Last name</label>
              <input id="cart-last-name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <div className="form-field">
              <label htmlFor="cart-email">Email</label>
              <input id="cart-email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-field">
              <label htmlFor="cart-phone">Phone</label>
              <input id="cart-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="form-field">
              <label htmlFor="cart-delivery-address">Delivery address</label>
              <input
                id="cart-delivery-address"
                placeholder="Street, building, apartment/house no."
                value={form.deliveryAddress}
                onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label htmlFor="cart-delivery-city">Town / City</label>
              <input
                id="cart-delivery-city"
                placeholder="e.g. Nairobi"
                value={form.deliveryCity}
                onChange={(e) => setForm((f) => ({ ...f, deliveryCity: e.target.value }))}
              />
            </div>
          </div>

          {error ? <p style={{ color: 'var(--shop-danger)', fontSize: 'var(--shop-text-sm)', marginBottom: 'var(--shop-space-3)' }}>{error}</p> : null}

          <button className="btn btn-primary btn-block" disabled={submitting} onClick={onCheckout} style={{ marginTop: 'var(--shop-space-3)' }}>
            {submitting ? 'Processing...' : `Pay KES ${total.toLocaleString()}`}
          </button>

          {shopInfo.whatsappNumber ? (
            <button type="button" className="btn btn-accent btn-block" onClick={onWhatsapp} style={{ marginTop: 'var(--shop-space-3)' }}>
              <WhatsAppIcon /> Buy via WhatsApp instead
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}
