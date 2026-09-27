"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ shopSlug: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label>Shop slug<input value={form.shopSlug} onChange={(e) => setForm((f) => ({ ...f, shopSlug: e.target.value }))} required /></label>
      <label>Email<input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required /></label>
      <label>Password<input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required /></label>
      <button type="submit">Log in</button>
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      <p><a href="/portal/signup">Create a new shop instead</a></p>
    </form>
  );
}
