"use client";

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

type DomainStatus = {
  customDomain: string | null;
  pendingDomain: string | null;
  domainVerificationToken: string | null;
  domainVerifiedAt: string | null;
};

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('shops_platform_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function DomainPage() {
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`${API_BASE}/portal/domain`, { headers: authHeaders() });
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/portal/domain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      const res = await fetch(`${API_BASE}/portal/domain/verify`, { method: 'POST', headers: authHeaders() });
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
    await fetch(`${API_BASE}/portal/domain`, { method: 'DELETE', headers: authHeaders() });
    await load();
    setBusy(false);
  }

  if (!status) return <p>Loading...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0 }}>Custom domain</h3>

      {status.customDomain ? (
        <div>
          <p>
            Your storefront is live at <strong>{status.customDomain}</strong>.
          </p>
          <button onClick={onDisconnect} disabled={busy}>Disconnect this domain</button>
        </div>
      ) : status.pendingDomain ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p>
            Add this DNS record at your domain registrar, then click Verify. DNS
            changes can take a few hours to take effect.
          </p>
          <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr>
                <td style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>Type</td>
                <td>TXT</td>
              </tr>
              <tr>
                <td style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>Name</td>
                <td><code>_shops-platform-verify.{status.pendingDomain}</code></td>
              </tr>
              <tr>
                <td style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>Value</td>
                <td><code>{status.domainVerificationToken}</code></td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onVerify} disabled={busy}>{busy ? 'Checking...' : 'Verify'}</button>
            <button onClick={onDisconnect} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <form onSubmit={onRequest} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            Your domain (e.g. nairobigents.co.ke)
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourshop.co.ke" required />
          </label>
          <button type="submit" disabled={busy}>Connect domain</button>
        </form>
      )}

      {info ? <p style={{ color: 'green' }}>{info}</p> : null}
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
    </div>
  );
}
