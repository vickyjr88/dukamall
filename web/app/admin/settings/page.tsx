"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';

type SmtpSettings = {
  smtpHost: string | null; smtpPort: number | null; smtpUser: string | null;
  smtpFrom: string | null; smtpSecure: boolean; smtpPasswordSet: boolean;
};

// Platform-wide SMTP identity -- system email (order confirmations,
// password resets, staff-invite credentials) goes out from this one
// address for every shop, not a per-shop mailbox. See EmailService's own
// header comment for why that's the deliberate design.
export default function AdminSettingsPage() {
  const [form, setForm] = useState({ smtpHost: '', smtpPort: '', smtpUser: '', smtpFrom: '', smtpSecure: false });
  const [password, setPassword] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await adminFetch('/admin/platform-settings/smtp');
    const data: SmtpSettings = await res.json();
    setForm({
      smtpHost: data.smtpHost ?? '',
      smtpPort: data.smtpPort ? String(data.smtpPort) : '',
      smtpUser: data.smtpUser ?? '',
      smtpFrom: data.smtpFrom ?? '',
      smtpSecure: data.smtpSecure,
    });
    setPasswordSet(data.smtpPasswordSet);
  }

  useEffect(() => { load(); }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    setSaving(true);
    try {
      const res = await adminFetch('/admin/platform-settings/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smtpHost: form.smtpHost,
          smtpPort: form.smtpPort ? Number(form.smtpPort) : undefined,
          smtpUser: form.smtpUser,
          smtpFrom: form.smtpFrom,
          smtpSecure: form.smtpSecure,
          ...(password ? { smtpPassword: password } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not save settings');
      setPassword('');
      await load();
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="admin-page-head"><h3>Platform settings</h3></div>

      <div className="admin-card" style={{ maxWidth: 480 }}>
        <h4>System email (SMTP)</h4>
        <p style={{ fontSize: 13, color: 'var(--a-muted)', marginBottom: 16 }}>
          Used to send order confirmations, staff-invite credentials, and password resets for every shop on the platform.
        </p>
        <form onSubmit={onSave}>
          <div className="admin-field">
            <label>Host</label>
            <input value={form.smtpHost} onChange={(e) => setForm((f) => ({ ...f, smtpHost: e.target.value }))} placeholder="smtp.example.com" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="admin-field" style={{ flex: 1 }}>
              <label>Port</label>
              <input type="number" value={form.smtpPort} onChange={(e) => setForm((f) => ({ ...f, smtpPort: e.target.value }))} placeholder="587" />
            </div>
            <div className="admin-field" style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
              <input type="checkbox" id="smtp-secure" checked={form.smtpSecure} onChange={(e) => setForm((f) => ({ ...f, smtpSecure: e.target.checked }))} style={{ width: 'auto' }} />
              <label htmlFor="smtp-secure" style={{ marginBottom: 0 }}>Use TLS (port 465)</label>
            </div>
          </div>
          <div className="admin-field">
            <label>Username</label>
            <input value={form.smtpUser} onChange={(e) => setForm((f) => ({ ...f, smtpUser: e.target.value }))} />
          </div>
          <div className="admin-field">
            <label>Password {passwordSet ? <span className="admin-badge is-active" style={{ marginLeft: 6 }}>Set</span> : <span className="admin-badge is-trial" style={{ marginLeft: 6 }}>Not set</span>}</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={passwordSet ? 'Leave blank to keep current password' : ''} />
          </div>
          <div className="admin-field">
            <label>From address</label>
            <input value={form.smtpFrom} onChange={(e) => setForm((f) => ({ ...f, smtpFrom: e.target.value }))} placeholder="Shops Platform <no-reply@dukamall.app>" />
          </div>
          {saved ? <div className="admin-alert is-success">Saved.</div> : null}
          {error ? <div className="admin-alert is-error">{error}</div> : null}
          <button type="submit" className="admin-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </form>
      </div>

      <TrialPolicyCard />
      <TestEmailCard />
    </div>
  );
}

// Sends a real message through the saved settings and shows the mail server's
// own answer, so "it doesn't work" can be told apart from a wrong password or a
// blocked port without reading server logs.
function TestEmailCard() {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await adminFetch('/admin/platform-settings/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(to.trim() ? { to: to.trim() } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, message: Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Could not send the test' });
      } else if (data.ok) {
        setResult({ ok: true, message: `Sent to ${data.to}. Check that inbox (and its spam folder).` });
      } else {
        setResult({ ok: false, message: `${data.status === 'SKIPPED' ? 'Not sent' : 'Failed'}: ${data.error}` });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-card" style={{ maxWidth: 480, marginTop: 20 }}>
      <h4>Test the email settings</h4>
      <p style={{ fontSize: 13, color: 'var(--a-muted)', marginBottom: 16 }}>
        Save your settings first, then send a test. Leave the address blank to send it to your own login email.
      </p>
      <form onSubmit={onSend}>
        <div className="admin-field">
          <label htmlFor="test-to">Send to (optional)</label>
          <input id="test-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" />
        </div>
        {result ? <div className={`admin-alert ${result.ok ? 'is-success' : 'is-error'}`}>{result.message}</div> : null}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="submit" className="admin-btn" disabled={busy}>{busy ? 'Sending...' : 'Send test email'}</button>
          <Link href="/admin/emails">View the email log</Link>
        </div>
      </form>
    </div>
  );
}

// How trials work for new shops, and what happens when one ends. Closing a shop
// automatically is off unless you switch it on here.
function TrialPolicyCard() {
  const [form, setForm] = useState({ trialDays: '14', suspendExpiredTrials: false, trialGraceDays: '7' });
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminFetch('/admin/platform-settings/trial').then(async (res) => {
      if (!res.ok) return;
      const d = await res.json();
      setForm({ trialDays: String(d.trialDays), suspendExpiredTrials: d.suspendExpiredTrials, trialGraceDays: String(d.trialGraceDays) });
    });
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const res = await adminFetch('/admin/platform-settings/trial', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trialDays: Number(form.trialDays), suspendExpiredTrials: form.suspendExpiredTrials, trialGraceDays: Number(form.trialGraceDays) }),
    });
    setSaving(false);
    if (res.ok) setMessage({ ok: true, text: 'Saved.' });
    else {
      const d = await res.json().catch(() => null);
      setMessage({ ok: false, text: Array.isArray(d?.message) ? d.message.join(', ') : d?.message || 'Could not save' });
    }
  }

  async function onRun() {
    if (!window.confirm('Run the trial check now? It emails merchants whose trial is ending or ended, and suspends shops past their grace period if automatic suspension is on.')) return;
    setRunning(true);
    setMessage(null);
    const res = await adminFetch('/admin/platform-settings/trial/run', { method: 'POST' });
    setRunning(false);
    if (res.ok) {
      const d = await res.json();
      setMessage({ ok: true, text: `Done: ${d.reminders} reminder email${d.reminders === 1 ? '' : 's'} sent, ${d.suspended} shop${d.suspended === 1 ? '' : 's'} suspended.` });
    } else setMessage({ ok: false, text: 'The check could not run.' });
  }

  return (
    <div className="admin-card" style={{ maxWidth: 480, marginTop: 20 }}>
      <h4>Free trials</h4>
      <p style={{ fontSize: 13, color: 'var(--a-muted)', marginBottom: 16 }}>
        New shops get a trial of this length. Their owners are emailed 7, 3 and 1 day before it ends, and when it ends. Shops that signed up before this existed have no end date until you set one on the shop&apos;s page.
      </p>
      <form onSubmit={onSave}>
        <div className="admin-field">
          <label htmlFor="trial-days">Trial length (days)</label>
          <input id="trial-days" type="number" min={1} max={90} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} />
        </div>
        <div className="admin-field" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <input type="checkbox" id="trial-suspend" checked={form.suspendExpiredTrials} onChange={(e) => setForm((f) => ({ ...f, suspendExpiredTrials: e.target.checked }))} style={{ width: 'auto', marginTop: 3 }} />
          <label htmlFor="trial-suspend" style={{ marginBottom: 0 }}>
            Close shops automatically after their trial ends
            <span className="hint" style={{ display: 'block' }}>Off means nothing happens when a trial ends beyond the emails; you decide shop by shop.</span>
          </label>
        </div>
        <div className="admin-field">
          <label htmlFor="trial-grace">Grace period before closing (days)</label>
          <input id="trial-grace" type="number" min={0} max={60} value={form.trialGraceDays} disabled={!form.suspendExpiredTrials} onChange={(e) => setForm((f) => ({ ...f, trialGraceDays: e.target.value }))} />
          <span className="hint">Time after the end date for a late payment to arrive. Only used when automatic closing is on.</span>
        </div>
        {message ? <div className={`admin-alert ${message.ok ? 'is-success' : 'is-error'}`}>{message.text}</div> : null}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="submit" className="admin-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button type="button" className="admin-btn-outline admin-btn" disabled={running} onClick={onRun}>{running ? 'Running...' : 'Run the check now'}</button>
        </div>
      </form>
    </div>
  );
}
