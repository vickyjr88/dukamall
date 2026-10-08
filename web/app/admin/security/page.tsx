"use client";

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { adminFetch } from '../admin-api';

type Status = { available: boolean; enabled: boolean; enabledAt: string | null; recoveryCodesLeft: number; required: boolean };

const message = (d: any, fallback: string) => (Array.isArray(d?.message) ? d.message.join(', ') : d?.message || fallback);

// Your own two-factor sign-in: link an authenticator app, keep recovery codes,
// or turn it off. Only exists when the platform has two-factor switched on.
export default function AdminSecurityPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<null | 'disable' | 'regenerate'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await adminFetch('/admin-auth/2fa/status');
    if (res.ok) setStatus(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function post(path: string, body?: object) {
    setBusy(true);
    setError(null);
    const res = await adminFetch(`/admin-auth/2fa/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setError(message(data, 'That did not work')); return null; }
    return data;
  }

  async function onStart() {
    const data = await post('setup');
    if (!data) return;
    setSetup({ secret: data.secret, qr: await QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 200 }) });
    setCode('');
  }

  async function onEnable(e: React.FormEvent) {
    e.preventDefault();
    const data = await post('enable', { code: code.trim() });
    if (!data) return;
    setSetup(null); setCode(''); setSaved(false);
    setRecoveryCodes(data.recoveryCodes);
    await load();
  }

  async function onDisable(e: React.FormEvent) {
    e.preventDefault();
    const data = await post('disable', { password, code: code.trim() });
    if (!data) return;
    setMode(null); setPassword(''); setCode('');
    await load();
  }

  async function onRegenerate(e: React.FormEvent) {
    e.preventDefault();
    const data = await post('recovery-codes', { code: code.trim() });
    if (!data) return;
    setMode(null); setCode(''); setSaved(false);
    setRecoveryCodes(data.recoveryCodes);
    await load();
  }

  if (!status) return <p>Loading...</p>;

  if (!status.available) {
    return (
      <div>
        <div className="admin-page-head"><h3>Security</h3></div>
        <div className="admin-card" style={{ maxWidth: 520 }}>
          <p style={{ margin: 0 }}>Two-factor sign-in isn&apos;t switched on for this platform. It can be turned on by setting <code>ADMIN_2FA_ENABLED=true</code> on the server.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-page-head"><h3>Security</h3></div>
      {status.required && !status.enabled ? (
        <div className="admin-alert is-warning" style={{ maxWidth: 560 }}>Two-factor sign-in is required for every platform admin. Set it up below to continue using the console.</div>
      ) : null}
      {error ? <div className="admin-alert is-error" style={{ maxWidth: 560 }}>{error}</div> : null}

      {recoveryCodes ? (
        <div className="admin-card" style={{ maxWidth: 560, marginBottom: 16 }}>
          <h4>Save your recovery codes</h4>
          <p style={{ fontSize: 13 }}>If you lose your phone, each of these lets you in once. <strong>They are shown only now.</strong> Store them somewhere safe, such as a password manager.</p>
          <pre style={{ background: 'var(--a-paper)', border: '1px solid var(--a-line)', borderRadius: 6, padding: 12, fontSize: 14, lineHeight: 1.8, margin: '12px 0' }}>{recoveryCodes.join('\n')}</pre>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="admin-btn-outline admin-btn" onClick={() => navigator.clipboard?.writeText(recoveryCodes.join('\n'))}>Copy</button>
            <button
              type="button"
              className="admin-btn-outline admin-btn"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([`Shops Platform admin recovery codes\n\n${recoveryCodes.join('\n')}\n`], { type: 'text/plain' }));
                const a = document.createElement('a'); a.href = url; a.download = 'shops-platform-recovery-codes.txt'; a.click(); URL.revokeObjectURL(url);
              }}
            >Download</button>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0', fontSize: 13 }}>
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} style={{ width: 'auto' }} /> I have saved these codes
          </label>
          <button type="button" className="admin-btn" disabled={!saved} onClick={() => setRecoveryCodes(null)}>Done</button>
        </div>
      ) : null}

      <div className="admin-card" style={{ maxWidth: 560 }}>
        <h4>Two-factor sign-in</h4>
        {status.enabled ? (
          <>
            <p style={{ margin: '0 0 6px' }}><span className="admin-badge is-active">On</span> since {status.enabledAt ? new Date(status.enabledAt).toLocaleDateString() : ''}</p>
            <p style={{ fontSize: 13, color: 'var(--a-muted)', margin: '0 0 14px' }}>
              {status.recoveryCodesLeft} recovery code{status.recoveryCodesLeft === 1 ? '' : 's'} left.{status.recoveryCodesLeft <= 2 ? ' Consider generating new ones.' : ''}
            </p>
            {mode === 'regenerate' ? (
              <form onSubmit={onRegenerate}>
                <div className="admin-field"><label htmlFor="sec-code">Code from your authenticator app</label>
                  <input id="sec-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="admin-btn" disabled={busy}>Generate new codes</button>
                  <button type="button" className="admin-btn-ghost" onClick={() => { setMode(null); setCode(''); setError(null); }}>Cancel</button>
                </div>
              </form>
            ) : mode === 'disable' ? (
              <form onSubmit={onDisable}>
                <div className="admin-field"><label htmlFor="sec-pw">Your password</label>
                  <input id="sec-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                <div className="admin-field"><label htmlFor="sec-code2">Code from your authenticator app</label>
                  <input id="sec-code2" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required /></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="admin-btn" disabled={busy}>Turn off two-factor</button>
                  <button type="button" className="admin-btn-ghost" onClick={() => { setMode(null); setCode(''); setPassword(''); setError(null); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="admin-btn-outline admin-btn" onClick={() => { setMode('regenerate'); setError(null); }}>New recovery codes</button>
                {!status.required ? <button type="button" className="admin-btn-ghost" onClick={() => { setMode('disable'); setError(null); }}>Turn off</button> : <span style={{ fontSize: 12, color: 'var(--a-muted)', alignSelf: 'center' }}>Required by the platform, so it can&apos;t be turned off.</span>}
              </div>
            )}
          </>
        ) : setup ? (
          <form onSubmit={onEnable}>
            <p style={{ fontSize: 13, marginTop: 0 }}>1. Scan this with an authenticator app (Google Authenticator, Authy, 1Password...).</p>
            <img src={setup.qr} alt="QR code to add this account to your authenticator app" width={200} height={200} style={{ display: 'block', margin: '8px 0' }} />
            <p style={{ fontSize: 12, color: 'var(--a-muted)' }}>Can&apos;t scan? Enter this key instead: <code style={{ wordBreak: 'break-all' }}>{setup.secret}</code></p>
            <p style={{ fontSize: 13 }}>2. Enter the 6-digit code it shows to confirm.</p>
            <div className="admin-field">
              <label htmlFor="sec-enable">6-digit code</label>
              <input id="sec-enable" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" required autoFocus />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="admin-btn" disabled={busy}>Turn on</button>
              <button type="button" className="admin-btn-ghost" onClick={() => { setSetup(null); setCode(''); setError(null); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <>
            <p style={{ margin: '0 0 6px' }}><span className="admin-badge is-trial">Off</span></p>
            <p style={{ fontSize: 13, color: 'var(--a-muted)', margin: '0 0 14px' }}>Adds a code from your phone to every login, so a stolen password alone can&apos;t get into the console.</p>
            <button type="button" className="admin-btn" onClick={onStart} disabled={busy}>Set up two-factor</button>
          </>
        )}
      </div>
    </div>
  );
}
