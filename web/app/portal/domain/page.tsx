"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type DomainStatus = {
  customDomain: string | null;
  pendingDomain: string | null;
  domainVerificationToken: string | null;
  domainVerifiedAt: string | null;
};

export default function DomainPage() {
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await portalFetch('/portal/domain');
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await portalFetch('/portal/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not connect that domain');
      setDomain('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await portalFetch('/portal/domain/verify', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Verification failed');
      setInfo('Domain verified! Your storefront is now live there.');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    await portalFetch('/portal/domain', { method: 'DELETE' });
    await load();
    setBusy(false);
  }

  if (!status) return <p>Loading...</p>;

  return (
    <div>
      <div className="portal-page-head"><h3>Custom domain</h3></div>

      <div className="portal-card" style={{ maxWidth: 520 }}>
        {status.customDomain ? (
          <div>
            <p style={{ marginBottom: 16 }}>Your storefront is live at <strong>{status.customDomain}</strong>.</p>
            <button className="portal-btn-outline portal-btn" onClick={onDisconnect} disabled={busy}>Disconnect this domain</button>
          </div>
        ) : status.pendingDomain ? (
          <div>
            <p style={{ marginBottom: 16 }}>
              Add this DNS record at your domain registrar, then click Verify. DNS changes can take a few hours to take effect.
            </p>
            <table className="portal-table" style={{ marginBottom: 16 }}>
              <tbody>
                <tr><td style={{ fontWeight: 600, width: 80 }}>Type</td><td>TXT</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Name</td><td><code>_shops-platform-verify.{status.pendingDomain}</code></td></tr>
                <tr><td style={{ fontWeight: 600 }}>Value</td><td><code>{status.domainVerificationToken}</code></td></tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="portal-btn" onClick={onVerify} disabled={busy}>{busy ? 'Checking...' : 'Verify'}</button>
              <button className="portal-btn-outline portal-btn" onClick={onDisconnect} disabled={busy}>Cancel</button>
            </div>
          </div>
        ) : (
          <form onSubmit={onRequest}>
            <div className="portal-field">
              <label>Your domain</label>
              <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourshop.co.ke" required />
            </div>
            <button type="submit" className="portal-btn" disabled={busy}>Connect domain</button>
          </form>
        )}

        {info ? <div className="portal-alert is-success" style={{ marginTop: 14 }}>{info}</div> : null}
        {error ? <div className="portal-alert is-error" style={{ marginTop: 14 }}>{error}</div> : null}
      </div>
    </div>
  );
}
