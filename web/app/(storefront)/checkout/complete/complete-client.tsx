"use client";

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useShopFetch } from '@/app/lib/shop-id-context';
import { useShopInfo } from '@/app/lib/shop-info-context';
import { fireAdEvent } from '@/app/lib/tracking';
import { WhatsAppIcon } from '@/app/whatsapp-icon';
import { recallOrder } from '../../cart/order-memory';

type View =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'paid'; orderNumber: string; totalKes: number }
  | { state: 'confirming'; orderNumber: string; totalKes: number }
  | { state: 'placed'; orderNumber: string; totalKes: number };

/**
 * Where a shopper lands after checkout. For an online payment it is where the payment provider sends them back, so it
 * confirms the payment with the provider before saying it went through. For an order paid on delivery it simply confirms
 * the order. Either way, this is the moment the purchase is reported to the ad platforms, once per order.
 */
export function CompleteClient() {
  const orderId = useSearchParams().get('order');
  const shopFetch = useShopFetch();
  const shopInfo = useShopInfo();
  const [view, setView] = useState<View>({ state: 'loading' });

  useEffect(() => {
    if (!orderId) { setView({ state: 'missing' }); return; }
    let cancelled = false;
    (async () => {
      const remembered = recallOrder(orderId);
      let next: View | null = null;
      try {
        const res = await shopFetch(`/checkout/${encodeURIComponent(orderId)}/verify`);
        if (res.ok) {
          const order = await res.json();
          next = order.status === 'PAID'
            ? { state: 'paid', orderNumber: order.orderNumber, totalKes: Number(order.totalKes) }
            : { state: 'confirming', orderNumber: order.orderNumber, totalKes: Number(order.totalKes) };
        }
      } catch {
        // Fall through to what checkout remembered.
      }
      if (!next && remembered) next = { state: 'placed', orderNumber: remembered.orderNumber, totalKes: remembered.totalKes };
      if (!next) next = { state: 'missing' };
      if (cancelled) return;
      setView(next);

      // Report the purchase once per order: a refresh of this page must not count it twice.
      if (next.state === 'paid' || next.state === 'placed') {
        const flag = `ng_purchased_${orderId}`;
        try {
          if (window.localStorage.getItem(flag)) return;
          window.localStorage.setItem(flag, '1');
        } catch {
          // Storage refused: better to report twice than never.
        }
        fireAdEvent('purchase', { value: next.totalKes, currency: shopInfo?.currency });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const currency = shopInfo?.currency || 'KES';
  const whatsapp = (shopInfo?.whatsappNumber || '').replace(/[^\d]/g, '');

  return (
    <main className="shop-container shop-section" style={{ maxWidth: 560 }}>
      {view.state === 'loading' ? <p>Checking your order…</p> : null}

      {view.state === 'missing' ? (
        <>
          <h1>We couldn&apos;t find that order</h1>
          <p>If you just paid, your payment is safe. Message us and we will confirm it for you.</p>
        </>
      ) : null}

      {view.state === 'paid' ? (
        <>
          <span className="eyebrow">Payment received</span>
          <h1>Thank you for your order</h1>
          <p>Order <strong>{view.orderNumber}</strong> · {currency} {view.totalKes.toLocaleString()}</p>
          <p>We will contact you shortly to arrange delivery.</p>
        </>
      ) : null}

      {view.state === 'confirming' ? (
        <>
          <span className="eyebrow">Confirming your payment</span>
          <h1>We are checking your payment</h1>
          <p>Order <strong>{view.orderNumber}</strong> · {currency} {view.totalKes.toLocaleString()}</p>
          <p>This can take a minute. If you were charged, your order is safe and we will confirm it by message.</p>
        </>
      ) : null}

      {view.state === 'placed' ? (
        <>
          <span className="eyebrow">Order placed</span>
          <h1>Thank you for your order</h1>
          <p>Order <strong>{view.orderNumber}</strong> · {currency} {view.totalKes.toLocaleString()}</p>
          <p>We will contact you to arrange payment and delivery.</p>
        </>
      ) : null}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
        <Link href="/" className="btn btn-primary">Keep shopping</Link>
        {whatsapp ? (
          <a className="btn btn-accent" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer">
            <WhatsAppIcon /> Message us
          </a>
        ) : null}
      </div>
    </main>
  );
}
