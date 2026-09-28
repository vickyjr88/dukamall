"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_API_BASE } from '../admin-api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Login failed');
      window.localStorage.setItem('shops_platform_admin_token', data.access_token);
      router.push('/admin/shops');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-card">
        <span className="tag">Platform operator</span>
        <div className="brand">Shops Platform -- Admin</div>
        <p className="subtitle">Log in to manage every shop on the platform.</p>
        <form onSubmit={onSubmit}>
          <div className="admin-field">
            <label htmlFor="admin-login-email">Email</label>
            <input id="admin-login-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="admin-field">
            <label htmlFor="admin-login-password">Password</label>
            <input id="admin-login-password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          </div>
          {error ? <div className="admin-alert is-error">{error}</div> : null}
          <button type="submit" className="admin-btn admin-btn-block" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className="switch-link">Running a shop instead? <a href="/portal/login">Go to the merchant portal</a></p>
      </div>
    </div>
  );
}
