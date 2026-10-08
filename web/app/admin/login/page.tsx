"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_API_BASE } from '../admin-api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set when the password was right but this account also needs an authenticator code.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  function finish(token: string) {
    window.localStorage.setItem('shops_platform_admin_token', token);
    router.push('/admin/shops');
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${ADMIN_API_BASE}/admin-auth/verify-2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: challenge, ...(useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() }) }),
      });
      const data = await res.json();
      if (!res.ok) {
        // An expired ticket or a locked account sends them back to the start.
        if (res.status === 429 || /log in again|expired/i.test(String(data?.message))) { setChallenge(null); setCode(''); }
        throw new Error(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'That did not work');
      }
      finish(data.access_token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

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
      if (data.requiresTwoFactor) { setChallenge(data.challengeToken); return; }
      finish(data.access_token);
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
        <p className="subtitle">{challenge ? 'Enter the code from your authenticator app.' : 'Log in to manage every shop on the platform.'}</p>
        {challenge ? (
          <form onSubmit={onVerify}>
            <div className="admin-field">
              <label htmlFor="admin-2fa-code">{useRecovery ? 'Recovery code' : '6-digit code'}</label>
              <input
                id="admin-2fa-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode={useRecovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus
                required
                placeholder={useRecovery ? 'xxxx-xxxx-xxxx' : '123456'}
              />
            </div>
            {error ? <div className="admin-alert is-error">{error}</div> : null}
            <button type="submit" className="admin-btn admin-btn-block" disabled={submitting}>{submitting ? 'Checking...' : 'Verify'}</button>
            <p className="switch-link">
              <a href="#" onClick={(e) => { e.preventDefault(); setUseRecovery(!useRecovery); setCode(''); setError(null); }}>
                {useRecovery ? 'Use my authenticator app instead' : "I can't use my authenticator app"}
              </a>
            </p>
            <p className="switch-link"><a href="#" onClick={(e) => { e.preventDefault(); setChallenge(null); setCode(''); setError(null); }}>Start again</a></p>
          </form>
        ) : (
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
        )}
        <p className="switch-link"><a href="/admin/forgot-password">Forgot your password?</a></p>
        <p className="switch-link">Running a shop instead? <a href="/portal/login">Go to the merchant portal</a></p>
      </div>
    </div>
  );
}
