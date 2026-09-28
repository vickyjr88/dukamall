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
    <main className="shop-container shop-section auth-card">
      <h1>Create an account</h1>
      <p className="subtitle">Track your orders and save your favorites.</p>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', gap: 'var(--shop-space-3)' }}>
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="reg-first-name">First name</label>
            <input id="reg-first-name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
          </div>
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="reg-last-name">Last name</label>
            <input id="reg-last-name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="reg-email">Email</label>
          <input id="reg-email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="form-field">
          <label htmlFor="reg-password">Password</label>
          <input id="reg-password" type="password" required minLength={8} placeholder="At least 8 characters" value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
        </div>
        {error ? <p style={{ color: 'var(--shop-danger)', fontSize: 'var(--shop-text-sm)', marginBottom: 'var(--shop-space-3)' }}>{error}</p> : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p className="switch-link">Already have an account? <a href="/account/login">Log in</a></p>
    </main>
  );
}
