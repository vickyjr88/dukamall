"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useShopFetch } from '@/app/lib/shop-id-context';

export default function CustomerRegisterPage() {
  const router = useRouter();
  const shopFetch = useShopFetch();
  const { login } = useCustomerAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await shopFetch('/customer-auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not create account');
      login(data.access_token, data.customer);
      router.push('/account');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shop-container" style={{ maxWidth: 360 }}>
      <h1>Create an account</h1>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input placeholder="First name" value={form.firstName}
          onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
        <input placeholder="Last name" value={form.lastName}
          onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
        <input type="email" placeholder="Email" required value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <input type="password" placeholder="Password (min 8 characters)" required minLength={8} value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        {error ? <p style={{ color: 'red' }}>{error}</p> : null}
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p style={{ marginTop: 12, fontSize: 13 }}>
        Already have an account? <a href="/account/login">Log in</a>
      </p>
    </main>
  );
}
