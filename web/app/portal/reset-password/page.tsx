"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PORTAL_API_BASE } from '../portal-api';

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${PORTAL_API_BASE}/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not reset password');
      setDone(true);
      setTimeout(() => router.push('/portal/login'), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return <div className="portal-alert is-error">This reset link is missing its token. Request a new one from the login page.</div>;
  }

  return (
    <>
      {done ? (
        <div className="portal-alert is-success">Password changed. Redirecting to login...</div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="portal-field">
            <label htmlFor="reset-password">New password</label>
            <input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="portal-field">
            <label htmlFor="reset-confirm">Confirm new password</label>
            <input id="reset-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          {error ? <div className="portal-alert is-error">{error}</div> : null}
          <button type="submit" className="portal-btn portal-btn-block" disabled={submitting}>
            {submitting ? 'Saving...' : 'Set new password'}
          </button>
        </form>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="portal-auth-shell">
      <div className="portal-auth-card">
        <div className="brand">Shops Platform</div>
        <p className="subtitle">Set a new password.</p>
        <Suspense fallback={<p>Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="switch-link"><a href="/portal/login">Back to login</a></p>
      </div>
    </div>
  );
}
