"use client";

import { useState } from 'react';
import { PORTAL_API_BASE } from '../portal-api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // originBaseUrl: this browser's own origin, so the emailed link points
      // back at whichever host (platform subdomain or a shop's own custom
      // domain) the request actually came from -- see
      // PasswordResetService.requestStaffReset's own comment.
      await fetch(`${PORTAL_API_BASE}/password-reset/staff/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, originBaseUrl: window.location.origin }),
      });
      // Always shows the same success message regardless of whether the
      // email matched an account -- matches the backend's own
      // no-enumeration behavior (PasswordResetService.requestStaffReset).
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-auth-shell">
      <div className="portal-auth-card">
        <div className="brand">Shops Platform</div>
        <p className="subtitle">Reset your password.</p>
        {sent ? (
          <div className="portal-alert is-success">
            If an account exists for that email, a reset link has been sent. It expires in 1 hour.
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="portal-field">
              <label htmlFor="forgot-email">Email</label>
              <input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <button type="submit" className="portal-btn portal-btn-block" disabled={submitting}>
              {submitting ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="switch-link"><a href="/portal/login">Back to login</a></p>
      </div>
    </div>
  );
}
