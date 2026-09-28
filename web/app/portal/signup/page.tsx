"use client";

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

export default function SignupPage() {
  const [form, setForm] = useState({ shopName: '', slug: '', ownerEmail: '', ownerFirstName: '', ownerLastName: '', password: '' });
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
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
      setResult(`Shop created: ${data.shop.slug} -- log in with your new account.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-auth-shell">
      <div className="portal-auth-card" style={{ maxWidth: 420 }}>
        <div className="brand">Create your shop</div>
        <p className="subtitle">Set up a new storefront in a minute.</p>
        <form onSubmit={onSubmit}>
          <div className="portal-field">
            <label htmlFor="signup-name">Shop name</label>
            <input id="signup-name" value={form.shopName} onChange={(e) => setForm((f) => ({ ...f, shopName: e.target.value }))} required />
          </div>
          <div className="portal-field">
            <label htmlFor="signup-slug">Shop URL slug</label>
            <input id="signup-slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="e.g. nairobigents" required />
          </div>
          <div className="portal-field">
            <label htmlFor="signup-email">Your email</label>
            <input id="signup-email" type="email" value={form.ownerEmail} onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))} required />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="portal-field" style={{ flex: 1 }}>
              <label htmlFor="signup-first">First name</label>
              <input id="signup-first" value={form.ownerFirstName} onChange={(e) => setForm((f) => ({ ...f, ownerFirstName: e.target.value }))} required />
            </div>
            <div className="portal-field" style={{ flex: 1 }}>
              <label htmlFor="signup-last">Last name</label>
              <input id="signup-last" value={form.ownerLastName} onChange={(e) => setForm((f) => ({ ...f, ownerLastName: e.target.value }))} required />
            </div>
          </div>
          <div className="portal-field">
            <label htmlFor="signup-password">Password</label>
            <input id="signup-password" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
          </div>
          {result ? <div className="portal-alert is-success">{result}</div> : null}
          {error ? <div className="portal-alert is-error">{error}</div> : null}
          <button type="submit" className="portal-btn portal-btn-block" disabled={submitting}>
            {submitting ? 'Creating shop...' : 'Create shop'}
          </button>
        </form>
        <p className="switch-link"><a href="/portal/login">Already have a shop? Log in</a></p>
      </div>
    </div>
  );
}
