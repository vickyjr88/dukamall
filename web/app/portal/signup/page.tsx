"use client";

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

export default function SignupPage() {
  const [form, setForm] = useState({ shopName: '', slug: '', ownerEmail: '', ownerFirstName: '', ownerLastName: '', password: '' });
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const res = await fetch(`${API_BASE}/onboarding/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.message || 'Could not create shop');
      return;
    }
    setResult(`Shop created: ${data.shop.slug} -- log in at /portal/login with your new account.`);
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label>Shop name<input value={form.shopName} onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))} required /></label>
      <label>Shop URL slug (e.g. nairobigents)<input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required /></label>
      <label>Your email<input type="email" value={form.ownerEmail} onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))} required /></label>
      <label>First name<input value={form.ownerFirstName} onChange={(e) => setForm((f) => ({ ...f, ownerFirstName: e.target.value }))} required /></label>
      <label>Last name<input value={form.ownerLastName} onChange={(e) => setForm((f) => ({ ...f, ownerLastName: e.target.value }))} required /></label>
      <label>Password<input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} /></label>
      <button type="submit">Create shop</button>
      {result ? <p style={{ color: 'green' }}>{result}</p> : null}
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
    </form>
  );
}
