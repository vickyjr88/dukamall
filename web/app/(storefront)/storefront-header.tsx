"use client";

import { useCustomerAuth } from '@/app/lib/customer-auth';

export function StorefrontHeader({ logoUrl }: { logoUrl: string | null }) {
  const { customer, ready } = useCustomerAuth();

  return (
    <header className="shop-header">
      <a className="logo" href="/">
        {logoUrl ? <img src={logoUrl} alt="" /> : 'Shop'}
      </a>
      <nav style={{ display: 'flex', gap: 16 }}>
        <a href="/cart">Cart</a>
        {!ready ? null : customer ? (
          <a href="/account">{customer.email.split('@')[0]}</a>
        ) : (
          <a href="/account/login">Log in</a>
        )}
      </nav>
    </header>
  );
}
