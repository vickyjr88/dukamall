"use client";

import { useEffect, useState } from 'react';
import { PORTAL_API_BASE, portalFetch } from '../portal-api';
import { OwnerOnlyNotice, useSession } from '../portal-session';
import { Overview, useOverview } from '../setup-panel';

const CURRENCIES = ['KES', 'UGX', 'TZS', 'USD'];

export default function SettingsPage() {
  const { ready, isOwner } = useSession();
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [orderPrefix, setOrderPrefix] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalFetch('/portal/settings').then((r) => r.json()).then((d) => {
      setWhatsappNumber(d.whatsappNumber ?? '');
      setCurrency(d.currency ?? 'KES');
      setOrderPrefix(d.orderPrefix ?? '');
    });
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    const res = await portalFetch('/portal/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatsappNumber, currency, orderPrefix: orderPrefix.toUpperCase() }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data?.message || 'Could not save settings');
      return;
    }
    setSaved(true);
  }

  return (
    <div>
      <div className="portal-page-head"><h3>Settings</h3></div>

      {ready && !isOwner ? (
        <div style={{ maxWidth: 480, marginBottom: 20 }}>
          <OwnerOnlyNotice what="change shop settings or payment keys" />
        </div>
      ) : (
      <>
      <div className="portal-card" style={{ maxWidth: 480, marginBottom: 20 }}>
        <h4>Shop settings</h4>
        <form onSubmit={onSave}>
          <div className="portal-field">
            <label>WhatsApp number</label>
            <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="254712345678" />
            <span className="hint">With country code, no spaces or +. Shown as the &quot;Buy via WhatsApp&quot; button on your cart page.</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="portal-field" style={{ flex: 1 }}>
              <label>Currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="portal-field" style={{ flex: 1 }}>
              <label>Order number prefix</label>
              <input
                value={orderPrefix}
                onChange={(e) => setOrderPrefix(e.target.value.toUpperCase())}
                placeholder="SHP"
                maxLength={8}
              />
              <span className="hint">2-8 letters/numbers, e.g. SHP-000123.</span>
            </div>
          </div>
          {saved ? <div className="portal-alert is-success">Saved.</div> : null}
          {error ? <div className="portal-alert is-error">{error}</div> : null}
          <button type="submit" className="portal-btn">Save</button>
        </form>
      </div>

      <DeliveryCard />
      <PaystackCard />
      <ConnectionsCard />
      </>
      )}
      <StaffCard />
      <ChangePasswordCard />
    </div>
  );
}

function DeliveryCard() {
  const [fee, setFee] = useState('0');
  const [freeOver, setFreeOver] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    portalFetch('/portal/settings').then((r) => r.json()).then((d) => {
      setFee(String(d.deliveryFeeKes ?? 0));
      setFreeOver(d.freeDeliveryOverKes ? String(d.freeDeliveryOverKes) : '');
      setNotifyEmail(d.notificationEmail ?? '');
    });
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false); setError(null); setSaving(true);
    try {
      const res = await portalFetch('/portal/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryFeeKes: Number(fee) || 0,
          freeDeliveryOverKes: freeOver.trim() === '' ? null : Number(freeOver),
          notificationEmail: notifyEmail.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(Array.isArray(data?.message) ? data.message.join(' ') : data?.message || 'Could not save');
      }
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="portal-card" style={{ maxWidth: 480, marginBottom: 20 }}>
      <h4>Delivery &amp; alerts</h4>
      <form onSubmit={onSave}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="portal-field" style={{ flex: 1 }}>
            <label htmlFor="dl-fee">Delivery fee (KES)</label>
            <input id="dl-fee" type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <div className="portal-field" style={{ flex: 1 }}>
            <label htmlFor="dl-free">Free delivery over (KES)</label>
            <input id="dl-free" type="number" min={0} step="0.01" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} placeholder="Never" />
          </div>
        </div>
        <span className="hint" style={{ display: 'block', marginTop: -6, marginBottom: 14 }}>
          One flat fee added at checkout, waived once the order (after any discount) reaches the amount on the right. Set 0 for free delivery on everything.
        </span>
        <div className="portal-field">
          <label htmlFor="dl-email">Send order alerts to</label>
          <input id="dl-email" type="email" value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} placeholder="Every owner's email" />
          <span className="hint">You&apos;re emailed when an order needs attention and when someone starts a WhatsApp order. Leave empty to alert every owner.</span>
        </div>
        {saved ? <div className="portal-alert is-success">Saved.</div> : null}
        {error ? <div className="portal-alert is-error">{error}</div> : null}
        <button type="submit" className="portal-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
      </form>
    </div>
  );
}

function PaystackCard() {
  const [secretKeySet, setSecretKeySet] = useState(false);
  const [publicKeySet, setPublicKeySet] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await portalFetch('/portal/settings');
    const data = await res.json();
    setSecretKeySet(Boolean(data.paystackSecretKeySet));
    setPublicKeySet(Boolean(data.paystackPublicKeySet));
  }

  useEffect(() => { load(); }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setSaving(true);
    try {
      // Blank fields mean "leave whatever key is already set alone" --
      // the form never shows a real key back (see ShopService.updateSettings's
      // own comment), so there's nothing to preserve client-side except by
      // sending nothing for a field the merchant didn't type into.
      await portalFetch('/portal/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(secretKey ? { paystackSecretKey: secretKey } : {}),
          ...(publicKey ? { paystackPublicKey: publicKey } : {}),
        }),
      });
      setSecretKey('');
      setPublicKey('');
      await load();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="portal-card" style={{ maxWidth: 480, marginBottom: 20 }}>
      <h4>Card payments (Paystack)</h4>
      <p style={{ fontSize: 13, color: 'var(--p-muted)', marginBottom: 12 }}>
        Enter the keys from your Paystack dashboard to accept card payments at checkout. Without these,
        customers can still order via WhatsApp.
      </p>
      <form onSubmit={onSave}>
        <div className="portal-field">
          <label>Secret key {secretKeySet ? <span className="portal-badge is-active" style={{ marginLeft: 6 }}>Set</span> : <span className="portal-badge is-trial" style={{ marginLeft: 6 }}>Not set</span>}</label>
          <input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder={secretKeySet ? 'Leave blank to keep current key' : 'sk_live_...'} />
        </div>
        <div className="portal-field">
          <label>Public key {publicKeySet ? <span className="portal-badge is-active" style={{ marginLeft: 6 }}>Set</span> : <span className="portal-badge is-trial" style={{ marginLeft: 6 }}>Not set</span>}</label>
          <input value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder={publicKeySet ? 'Leave blank to keep current key' : 'pk_live_...'} />
        </div>
        {saved ? <div className="portal-alert is-success">Saved. Keys are never shown again once set.</div> : null}
        <button type="submit" className="portal-btn" disabled={saving || (!secretKey && !publicKey)}>
          {saving ? 'Saving...' : 'Save keys'}
        </button>
      </form>
    </div>
  );
}

type StaffRow = { userId: string; role: 'OWNER' | 'STAFF'; user: { id: string; email: string; firstName: string; lastName: string } };

function StaffCard() {
  const { isOwner } = useSession();
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', role: 'STAFF' as 'OWNER' | 'STAFF' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitedCredentials, setInvitedCredentials] = useState<{ email: string; temporaryPassword: string } | null>(null);

  async function load() {
    const res = await portalFetch('/portal/staff');
    if (res.ok) setStaff(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInvitedCredentials(null);
    setBusy(true);
    try {
      const res = await portalFetch('/portal/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not add this staff member');
      if (data.temporaryPassword) setInvitedCredentials({ email: data.email, temporaryPassword: data.temporaryPassword });
      setForm({ email: '', firstName: '', lastName: '', role: 'STAFF' });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(userId: string) {
    if (!window.confirm("Remove this person's access to your shop?")) return;
    setError(null);
    const res = await portalFetch(`/portal/staff/${userId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setError(data?.message || 'Could not remove this staff member');
      return;
    }
    await load();
  }

  const ownerCount = staff?.filter((s) => s.role === 'OWNER').length ?? 0;

  return (
    <div className="portal-card" style={{ maxWidth: 560, marginBottom: 20 }}>
      <h4>Staff</h4>
      <p style={{ fontSize: 13, color: 'var(--p-muted)', marginBottom: 12 }}>
        {isOwner ? 'Add the people who help run your shop. Staff can manage orders and products; payment settings, discounts, analytics and the shop\'s look stay with owners.' : 'Only an owner can add or remove staff.'}
      </p>

      {!staff ? <p>Loading...</p> : (
        <table className="portal-table" style={{ marginBottom: 16 }}>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.userId}>
                <td>{s.user.firstName} {s.user.lastName}</td>
                <td>{s.user.email}</td>
                <td>{s.role}</td>
                <td>
                  {!isOwner ? null : s.role === 'OWNER' && ownerCount <= 1 ? (
                    <span style={{ fontSize: 12, color: 'var(--p-muted)' }}>Only owner</span>
                  ) : (
                    <button className="portal-btn-ghost" onClick={() => onRemove(s.userId)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isOwner ? (
        <>
      {invitedCredentials ? (
          <div className="portal-alert is-success">
            Added {invitedCredentials.email} with a temporary password: <strong>{invitedCredentials.temporaryPassword}</strong>
            <br />Share this with them now -- it won&apos;t be shown again. They should change it after logging in.
          </div>
        ) : null}
        {error ? <div className="portal-alert is-error">{error}</div> : null}
  
        <form onSubmit={onInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="portal-field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="portal-field" style={{ marginBottom: 0, flex: '1 1 140px' }}>
            <label>First name</label>
            <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
          </div>
          <div className="portal-field" style={{ marginBottom: 0, flex: '1 1 140px' }}>
            <label>Last name</label>
            <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
          </div>
          <div className="portal-field" style={{ marginBottom: 0, flex: '0 1 120px' }}>
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'OWNER' | 'STAFF' }))}>
              <option value="STAFF">Staff</option>
              <option value="OWNER">Owner</option>
            </select>
          </div>
          <button type="submit" className="portal-btn" disabled={busy}>{busy ? 'Adding...' : 'Add staff'}</button>
        </form>
        </>
      ) : null}
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

const PLAN_LABEL: Record<Overview['plan']['plan'], string> = { TRIAL: 'Free trial', BASIC: 'Basic', PRO: 'Pro' };

/** Addresses to paste into other services, and which plan the shop is on. */
function ConnectionsCard() {
  const overview = useOverview();
  const [copied, setCopied] = useState<string | null>(null);
  if (!overview) return null;

  const { urls, plan } = overview;
  const rows: { label: string; hint: string; value: string | null }[] = [
    { label: 'Your shop', hint: 'The address customers visit.', value: urls.storefront },
    { label: 'Product feed (CSV)', hint: 'For Google Merchant Center, Meta Commerce and similar catalogue imports.', value: urls.productFeedCsv },
    { label: 'Product feed (XML)', hint: 'The same catalogue as an XML feed.', value: urls.productFeedXml },
    { label: 'TikTok feed (CSV)', hint: 'For TikTok Shop / TikTok catalogue.', value: urls.tiktokFeedCsv },
    { label: 'Sitemap', hint: 'For Google Search Console.', value: urls.sitemap },
    // The backend only knows its own public address when it is configured; this page is served from it otherwise.
    { label: 'Paystack webhook', hint: 'Paste this under Settings > API Keys & Webhooks in your Paystack dashboard so payments are confirmed even if a customer closes their browser.', value: urls.paystackWebhook ?? `${PORTAL_API_BASE}/paystack/webhook` },
  ];

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch { /* clipboard can be blocked; the text is still selectable */ }
  }

  return (
    <div className="portal-card" style={{ maxWidth: 640, marginBottom: 20 }}>
      <h4>Connections</h4>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--p-muted)' }}>
        Plan: <strong style={{ color: 'var(--p-ink)' }}>{PLAN_LABEL[plan.plan]}</strong>
        {plan.plan === 'TRIAL' && plan.trialEndsAt ? ` — ends ${new Date(plan.trialEndsAt).toLocaleDateString()}` : ''}
      </p>
      {rows.map((row) => row.value ? (
        <div className="portal-field" key={row.label}>
          <label>{row.label}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={row.value} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1 }} />
            <button type="button" className="portal-btn-outline portal-btn" onClick={() => copy(row.value!, row.label)}>{copied === row.label ? 'Copied' : 'Copy'}</button>
          </div>
          <span className="hint">{row.hint}</span>
        </div>
      ) : null)}
    </div>
  );
}
