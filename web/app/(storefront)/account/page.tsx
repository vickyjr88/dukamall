"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useCustomerAuth } from '@/app/lib/customer-auth';

export default function AccountPage() {
  const router = useRouter();
  const { customer, ready, logout } = useCustomerAuth();

  useEffect(() => {
    if (ready && !customer) router.replace('/account/login');
  }, [ready, customer, router]);

  if (!ready || !customer) return null;

  return (
    <main className="shop-container" style={{ maxWidth: 480 }}>
      <h1>My account</h1>
      <p>{customer.email}</p>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
        <a href="/account/orders">Order history</a>
        <a href="/account/favorites">Favorites</a>
      </nav>
      <button
        type="button"
        onClick={() => { logout(); router.push('/'); }}
        style={{ background: 'none', border: '1px solid var(--shop-line)', padding: '8px 16px', cursor: 'pointer' }}
      >
        Log out
      </button>
    </main>
  );
}
