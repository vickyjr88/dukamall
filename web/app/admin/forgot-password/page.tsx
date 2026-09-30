"use client";

import { useState } from 'react';
import { ADMIN_API_BASE } from '../admin-api';

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Same /password-reset/staff/request endpoint the merchant portal
      // uses -- a platform admin is still just a User row (isSuperAdmin:
      // true), so there's no separate admin-only reset flow to build.
      await fetch(`${ADMIN_API_BASE}/password-reset/staff/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, originBaseUrl: window.location.origin }),
      });
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-card">
        <span className="tag">Platform operator</span>
        <div className="brand">Shops Platform -- Admin</div>
        <p className="subtitle">Reset your password.</p>
        {sent ? (
          <div className="admin-alert is-success">
            If an account exists for that email, a reset link has been sent. It expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="admin-field">
              <label htmlFor="admin-forgot-email">Email</label>
              <input id="admin-forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" className="admin-btn admin-btn-block" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="switch-link"><a href="/admin/login">Back to login</a></p>
      </div>
    </div>
  );
}
