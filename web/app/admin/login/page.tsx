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
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
      <label>Email<input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required /></label>
      <label>Password<input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required /></label>
      <button type="submit" disabled={submitting}>{submitting ? 'Logging in...' : 'Log in'}</button>
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
    </form>
  );
}
