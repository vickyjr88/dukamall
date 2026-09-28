"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useShopFetch } from '@/app/lib/shop-id-context';

export default function CustomerLoginPage() {
  const router = useRouter();
  const shopFetch = useShopFetch();
  const { login } = useCustomerAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await shopFetch('/customer-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Login failed');
      login(data.access_token, data.customer);
      router.push('/account');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="shop-container shop-section auth-card">
      <h1>Welcome back</h1>
      <p className="subtitle">Log in to see your orders and favorites.</p>
      <form onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" required value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="form-field">
          <label htmlFor="login-password">Password</label>
          <input id="login-password" type="password" required value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </div>
        {error ? <p style={{ color: 'var(--shop-danger)', fontSize: 'var(--shop-text-sm)', marginBottom: 'var(--shop-space-3)' }}>{error}</p> : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <p className="switch-link">New here? <a href="/account/register">Create an account</a></p>
    </main>
  );
}
