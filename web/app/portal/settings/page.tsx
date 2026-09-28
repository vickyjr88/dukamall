"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

export default function SettingsPage() {
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    portalFetch('/portal/settings').then((r) => r.json()).then((d) => setWhatsappNumber(d.whatsappNumber ?? ''));
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    await portalFetch('/portal/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatsappNumber }),
    });
    setSaved(true);
  }

  return (
    <div>
      <div className="portal-page-head"><h3>Settings</h3></div>

      <div className="portal-card" style={{ maxWidth: 480, marginBottom: 20 }}>
        <h4>Shop settings</h4>
        <form onSubmit={onSave}>
          <div className="portal-field">
            <label>WhatsApp number</label>
            <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="254712345678" />
            <span className="hint">With country code, no spaces or +. Shown as the &quot;Buy via WhatsApp&quot; button on your cart page.</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--p-muted)', marginBottom: 16 }}>
            Card payment (Paystack) setup isn&apos;t wired up in this admin yet -- contact platform support to connect it.
          </p>
          {saved ? <div className="portal-alert is-success">Saved.</div> : null}
          <button type="submit" className="portal-btn">Save</button>
        </form>
      </div>

      <ChangePasswordCard />
    </div>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      const res = await portalFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not change password');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-card" style={{ maxWidth: 480 }}>
      <h4>Change password</h4>
      <form onSubmit={onSubmit}>
        <div className="portal-field">
          <label>Current password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>
        <div className="portal-field">
          <label>New password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
        </div>
        <div className="portal-field">
          <label>Confirm new password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
        </div>
        {saved ? <div className="portal-alert is-success">Password changed.</div> : null}
        {error ? <div className="portal-alert is-error">{error}</div> : null}
        <button type="submit" className="portal-btn" disabled={submitting}>
          {submitting ? 'Changing...' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
