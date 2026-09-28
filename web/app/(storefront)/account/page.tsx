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
    <main className="shop-container shop-section" style={{ maxWidth: 480 }}>
      <span className="eyebrow">My account</span>
      <h1 style={{ marginBottom: 'var(--shop-space-2)' }}>Hi there</h1>
      <p style={{ color: 'var(--shop-muted)', marginBottom: 'var(--shop-space-6)' }}>{customer.email}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--shop-line)', marginBottom: 'var(--shop-space-6)' }}>
        <a href="/account/orders" style={{ background: '#fff', padding: 'var(--shop-space-4) var(--shop-space-5)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          Order history <span aria-hidden="true">&rarr;</span>
        </a>
        <a href="/account/favorites" style={{ background: '#fff', padding: 'var(--shop-space-4) var(--shop-space-5)', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          Favorites <span aria-hidden="true">&rarr;</span>
        </a>
      </div>

      <button type="button" onClick={() => { logout(); router.push('/'); }} className="btn btn-outline">
        Log out
      </button>
    </main>
  );
}
