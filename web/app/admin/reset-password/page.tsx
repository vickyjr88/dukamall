"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ADMIN_API_BASE } from '../admin-api';

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
      const res = await fetch(`${ADMIN_API_BASE}/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not reset password');
      setDone(true);
      setTimeout(() => router.push('/admin/login'), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return <div className="admin-alert is-error">This reset link is missing its token. Request a new one from the login page.</div>;
  }

  return (
    <>
      {done ? (
        <div className="admin-alert is-success">Password changed. Redirecting to login...</div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="admin-field">
            <label htmlFor="admin-reset-password">New password</label>
            <input id="admin-reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="admin-field">
            <label htmlFor="admin-reset-confirm">Confirm new password</label>
            <input id="admin-reset-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          {error ? <div className="admin-alert is-error">{error}</div> : null}
          <button type="submit" className="admin-btn admin-btn-block" disabled={submitting}>
            {submitting ? 'Saving...' : 'Set new password'}
          </button>
        </form>
      )}
    </>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-card">
        <span className="tag">Platform operator</span>
        <div className="brand">Shops Platform -- Admin</div>
        <p className="subtitle">Set a new password.</p>
        <Suspense fallback={<p>Loading...</p>}>
          <ResetPasswordForm />
        </Suspense>
        <p className="switch-link"><a href="/admin/login">Back to login</a></p>
      </div>
    </div>
  );
}
