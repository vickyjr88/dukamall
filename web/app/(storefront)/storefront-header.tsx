"use client";

import Link from 'next/link';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useCart } from '@/app/lib/cart';

export function StorefrontHeader({ shopName, logoUrl }: { shopName: string; logoUrl: string | null }) {
  const { customer, ready } = useCustomerAuth();
  const cart = useCart();

  return (
    <header className="shop-header">
      <Link className="logo" href="/">
        {logoUrl ? <img src={logoUrl} alt={shopName} /> : shopName}
      </Link>
      <div className="shop-header-actions">
        {!ready ? null : customer ? (
          <Link href="/account">{customer.email.split('@')[0]}</Link>
        ) : (
          <Link href="/account/login">Log in</Link>
        )}
        <Link href="/cart" className="shop-cart-badge" aria-label={`Cart, ${cart.count} item${cart.count === 1 ? '' : 's'}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6h15l-1.5 9h-12z" />
            <path d="M6 6 5 2H2" />
            <circle cx="9.5" cy="20" r="1" fill="currentColor" stroke="none" />
            <circle cx="17.5" cy="20" r="1" fill="currentColor" stroke="none" />
          </svg>
          {cart.ready && cart.count > 0 ? <span className="count">{cart.count}</span> : null}
        </Link>
      </div>
    </header>
  );
}
