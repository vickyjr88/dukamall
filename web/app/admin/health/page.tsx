"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { ago } from '../format';

type Status = 'ok' | 'warn' | 'fail';
type Check = { key: string; label: string; status: Status; summary: string; details?: Record<string, string | number | boolean | null> };
type Health = {
  overall: Status; checkedAt: string; checks: Check[];
  runtime: { host: string; nodeVersion: string; uptimeSeconds: number; memoryMb: number; environment: string };
};

const BADGE: Record<Status, string> = { ok: 'is-active', warn: 'is-trial', fail: 'is-suspended' };
const WORD: Record<Status, string> = { ok: 'Healthy', warn: 'Needs attention', fail: 'Problem' };
// Where to go to act on each check.
const FIX_LINK: Record<string, { href: string; label: string }> = {
  mail: { href: '/admin/emails', label: 'Open the email log' },
  trials: { href: '/admin/shops', label: 'See the shops' },
  security: { href: '/admin/users?admin=true', label: 'See platform admins' },
};
const DETAIL_LABEL: Record<string, string> = {
  responseMs: 'Response (ms)', latestMigration: 'Latest migration', sentLast24h: 'Sent (24h)', failedLast24h: 'Failed (24h)',
  notSentLast24h: 'Not sent (24h)', lastSuccessfulSend: 'Last successful send', stuckOrders: 'Unconfirmed orders', shopsAffected: 'Shops affected',
  keyConfigured: 'Key configured', storedSecrets: 'Stored secrets', storedAsPlaintext: 'Unencrypted', admins: 'Platform admins',
  adminsWithTwoFactor: 'With two-factor', twoFactorRequired: 'Two-factor required', apiDocsPublic: 'API docs public',
  trialsPastEndDate: 'Past end date', shopsOnTrialWithNoEndDate: 'No end date', autoSuspend: 'Auto-close on', lastReminderSent: 'Last reminder sent',
};

function formatDetail(key: string, value: string | number | boolean | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (/(Send|Sent)$/.test(key) && typeof value === 'string') return ago(value);
  return String(value);
}

function uptime(seconds: number): string {
  const d = Math.floor(seconds / 86400); const h = Math.floor((seconds % 86400) / 3600); const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

// One place to see whether the platform is healthy -- including the things that
// fail quietly (mail not sending, payments never confirmed, secrets unencrypted).
export default function AdminHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch('/admin/health');
      if (!res.ok) throw new Error('The health check could not run.');
      setHealth(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const problems = health ? health.checks.filter((c) => c.status !== 'ok').length : 0;

  return (
    <div>
      <div className="admin-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3>Platform health</h3>
        <button type="button" className="admin-btn-outline admin-btn" onClick={load} disabled={loading}>{loading ? 'Checking...' : 'Check again'}</button>
      </div>
      {error ? <div className="admin-alert is-error">{error}</div> : null}

      {health ? (
        <>
          <div className={`admin-alert ${health.overall === 'ok' ? 'is-success' : health.overall === 'warn' ? 'is-warning' : 'is-error'}`}>
            <strong>{health.overall === 'ok' ? 'Everything looks healthy.' : `${problems} thing${problems === 1 ? '' : 's'} need${problems === 1 ? 's' : ''} attention.`}</strong>
            {' '}Checked {ago(health.checkedAt)}.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {health.checks.map((c) => (
              <div className="admin-card" key={c.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                  <strong>{c.label}</strong>
                  <span className={`admin-badge ${BADGE[c.status]}`}>{WORD[c.status]}</span>
                </div>
                <div style={{ fontSize: 14 }}>{c.summary}</div>
                {c.details ? (
                  <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '8px 16px', margin: '12px 0 0', fontSize: 12 }}>
                    {Object.entries(c.details).map(([k, v]) => (
                      <div key={k}>
                        <dt style={{ color: 'var(--a-muted)' }}>{DETAIL_LABEL[k] ?? k}</dt>
                        <dd style={{ margin: 0, fontWeight: 600 }}>{formatDetail(k, v)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {c.status !== 'ok' && FIX_LINK[c.key] ? <p style={{ margin: '10px 0 0', fontSize: 13 }}><Link href={FIX_LINK[c.key].href}>{FIX_LINK[c.key].label} &rarr;</Link></p> : null}
                {c.status !== 'ok' && c.key === 'mail' ? <p style={{ margin: '6px 0 0', fontSize: 13 }}><Link href="/admin/settings">Email settings &amp; test &rarr;</Link></p> : null}
              </div>
            ))}
          </div>

          <p style={{ marginTop: 20, fontSize: 12, color: 'var(--a-muted)' }}>
            Answered by server <strong>{health.runtime.host}</strong> &middot; up {uptime(health.runtime.uptimeSeconds)} &middot; Node {health.runtime.nodeVersion} &middot; {health.runtime.memoryMb} MB &middot; environment: {health.runtime.environment}
          </p>
        </>
      ) : !error ? <p>Checking...</p> : null}
    </div>
  );
}
