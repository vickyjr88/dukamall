"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ shopSlug: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || 'Login failed');
        return;
      }
      window.localStorage.setItem('shops_platform_token', data.access_token);
      router.push('/portal/dashboard');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-auth-shell">
      <div className="portal-auth-card">
        <div className="brand">Shops Platform</div>
        <p className="subtitle">Log in to manage your shop.</p>
        <form onSubmit={onSubmit}>
          <div className="portal-field">
            <label htmlFor="login-slug">Shop slug</label>
            <input id="login-slug" value={form.shopSlug} onChange={(e) => setForm((f) => ({ ...f, shopSlug: e.target.value }))} required />
          </div>
          <div className="portal-field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="portal-field">
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          </div>
          {error ? <div className="portal-alert is-error">{error}</div> : null}
          <button type="submit" className="portal-btn portal-btn-block" disabled={submitting}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
        <p className="switch-link"><a href="/portal/forgot-password">Forgot your password?</a></p>
        <p className="switch-link"><a href="/portal/signup">Create a new shop instead</a></p>
        <p className="switch-link"><a href="/admin/login">Platform operator? Log in here</a></p>
      </div>
    </div>
  );
}
