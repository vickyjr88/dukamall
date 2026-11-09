"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { ago } from '../format';

type Connection = { present: boolean; enabled: boolean; lastCheckedAt: string | null; lastError: string | null; tokenExpiresAt: string | null };
type Tally = { posted: number; failed: number; topFailure: string | null };
type Attention = { key: string; severity: 'problem' | 'warn'; text: string };
type Row = {
  shop: { id: string; name: string; slug: string };
  whatsapp: Connection; facebook: Connection; threads: Connection;
  features: { welcomeSeries: boolean; commentReplies: boolean; postFacebook: boolean; postThreads: boolean };
  whatsappActivity: { sent: number; failed: number; delivered: number; newPeople: number; optOuts: number };
  comments: { sent: number; failed: number; skipped: number };
  posts: { facebook: Tally; threads: Tally };
  status: { prepared: number; posted: number };
  attention: Attention[];
};
type Overview = {
  days: 1 | 7; since: string; postingAllowed: boolean; rows: Row[];
  totals: { shops: number; withConnections: number; withProblems: number; withWarnings: number; whatsappSent: number; whatsappFailed: number; commentReplies: number; posted: number; postsFailed: number; statusPrepared: number };
};

const muted = { color: 'var(--a-muted)' } as const;

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return <div className="admin-stat"><div className="label">{label}</div><div className={`value${danger && value > 0 ? ' is-danger' : ''}`}>{value}</div></div>;
}

/** One connection as a small chip: what state it is in, in words. */
function Chip({ label, c }: { label: string; c: Connection }) {
  if (!c.present) return <span className="admin-badge" style={{ background: 'transparent', border: '1px solid var(--a-line)', color: 'var(--a-muted)' }}>{label}: not connected</span>;
  if (!c.enabled) return <span className="admin-badge is-trial">{label}: switched off</span>;
  if (c.lastError) return <span className="admin-badge is-suspended" title={c.lastError}>{label}: problem</span>;
  if (!c.lastCheckedAt) return <span className="admin-badge is-trial">{label}: never tested</span>;
  return <span className="admin-badge is-active" title={`Last tested ${ago(c.lastCheckedAt)}`}>{label}: working</span>;
}

function featuresOf(f: Row['features']): string {
  const on = [f.welcomeSeries && 'welcoming people who message', f.commentReplies && 'answering Page comments', f.postFacebook && 'posting to the Page', f.postThreads && 'posting to Threads'].filter(Boolean);
  return on.length ? on.join(', ') : 'nothing switched on';
}

// Every shop's WhatsApp, Page comments and posting at a glance: what is connected and on, what happened, and what needs a person, worst first.
export default function AdminMessagingPage() {
  const [days, setDays] = useState<1 | 7>(1);
  const [data, setData] = useState<Overview | null>(null);
  const [onlyTrouble, setOnlyTrouble] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await adminFetch(`/admin/messaging?days=${days}`);
      if (!res.ok) throw new Error('Could not load the overview.');
      setData(await res.json());
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const rows = (data?.rows ?? []).filter((r) => !onlyTrouble || r.attention.length > 0);
  const t = data?.totals;
  const period = days === 1 ? 'the last 24 hours' : 'the last 7 days';

  return (
    <div>
      <div className="admin-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ margin: 0 }}>Shops&apos; WhatsApp, Facebook and Threads</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" className={days === 1 ? 'admin-btn admin-btn-sm' : 'admin-btn-outline admin-btn admin-btn-sm'} onClick={() => setDays(1)}>24 hours</button>
          <button type="button" className={days === 7 ? 'admin-btn admin-btn-sm' : 'admin-btn-outline admin-btn admin-btn-sm'} onClick={() => setDays(7)}>7 days</button>
          <button type="button" className="admin-btn-outline admin-btn admin-btn-sm" disabled={loading} onClick={() => void load()}>{loading ? 'Loading...' : 'Refresh'}</button>
        </div>
      </div>
      {error ? <div className="admin-alert is-error">{error}</div> : null}
      {data && !data.postingAllowed ? <div className="admin-alert is-error">Posting is switched off on this server (SOCIAL_POSTING=false), so no shop is posting to its Page or Threads whatever it has set.</div> : null}

      {t ? (
        <>
          <div className="admin-stat-row">
            <Stat label="Shops connected" value={t.withConnections} />
            <Stat label="With a problem" value={t.withProblems} danger />
            <Stat label="With a warning" value={t.withWarnings} />
            <Stat label={`WhatsApp sent (${days === 1 ? '24h' : '7d'})`} value={t.whatsappSent} />
            <Stat label="WhatsApp failed" value={t.whatsappFailed} danger />
            <Stat label="Posts made" value={t.posted} />
            <Stat label="Posts failed" value={t.postsFailed} danger />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '0 0 16px', fontSize: 14 }}>
            <input type="checkbox" checked={onlyTrouble} onChange={(e) => setOnlyTrouble(e.target.checked)} style={{ width: 'auto' }} />
            Only shops that need attention
          </label>
        </>
      ) : null}

      {!data ? <p style={muted}>Loading...</p> : data.rows.length === 0 ? (
        <div className="admin-empty">No shop has connected WhatsApp, Facebook or Threads yet. {t ? `${t.shops} shop${t.shops === 1 ? '' : 's'} on the platform.` : ''}</div>
      ) : rows.length === 0 ? (
        <div className="admin-empty">No shop needs attention in {period}.</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {rows.map((r) => {
            const worst = r.attention.some((a) => a.severity === 'problem') ? 'problem' : r.attention.length ? 'warn' : null;
            const w = r.whatsappActivity;
            const failedPosts = r.posts.facebook.failed + r.posts.threads.failed;
            return (
              <div key={r.shop.id} className="admin-card" style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/admin/shops/${r.shop.id}`} style={{ fontWeight: 700, fontSize: 16 }}>{r.shop.name}</Link>
                    <span style={{ ...muted, marginLeft: 8, fontSize: 13 }}>{r.shop.slug}</span>
                  </div>
                  <span className={`admin-badge ${worst === 'problem' ? 'is-suspended' : worst === 'warn' ? 'is-trial' : 'is-active'}`}>
                    {worst === 'problem' ? 'Needs attention' : worst === 'warn' ? 'Warning' : 'All good'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
                  <Chip label="WhatsApp" c={r.whatsapp} /><Chip label="Facebook Page" c={r.facebook} /><Chip label="Threads" c={r.threads} />
                </div>
                <p style={{ margin: '0 0 6px', fontSize: 13, ...muted }}>On: {featuresOf(r.features)}.</p>
                <p style={{ margin: 0, fontSize: 13, overflowWrap: 'anywhere' }}>
                  In {period}: WhatsApp <strong>{w.sent}</strong> sent{w.failed ? <>, <strong style={{ color: 'var(--a-danger)' }}>{w.failed} failed</strong></> : null}, {w.delivered} delivered, {w.newPeople} new
                  {w.optOuts ? `, ${w.optOuts} opted out` : ''}. Page comments answered <strong>{r.comments.sent}</strong>{r.comments.failed ? <>, <strong style={{ color: 'var(--a-danger)' }}>{r.comments.failed} failed</strong></> : null}.
                  {' '}Posts <strong>{r.posts.facebook.posted + r.posts.threads.posted}</strong>{failedPosts ? <>, <strong style={{ color: 'var(--a-danger)' }}>{failedPosts} failed</strong></> : null}.
                  {r.status.prepared ? ` Status pictures ${r.status.prepared} ready, ${r.status.posted} posted.` : ''}
                </p>
                {r.attention.length ? (
                  <ul style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13 }}>
                    {r.attention.map((a) => <li key={a.key} style={{ marginBottom: 3, color: a.severity === 'problem' ? 'var(--a-danger)' : undefined, overflowWrap: 'anywhere' }}>{a.text}</li>)}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <p style={{ ...muted, fontSize: 12, marginTop: 18 }}>
        Read-only, and no token or secret is ever shown here. The detail is the shop&apos;s own, under Portal &gt; Connections; open the shop to see it as its owner would.
      </p>
    </div>
  );
}
