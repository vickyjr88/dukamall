"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { OwnerOnlyNotice, useSession } from '../portal-session';

type Status = {
  connected: boolean; enabled: boolean; publicReply: boolean; pageId: string | null; subscribed: boolean; subscriptionError: string | null;
  sent: number; skipped: number; failed: number; waiting: number; sentToday: number; dailyCap: number;
};
type Row = { id: string; fromName: string | null; message: string | null; status: string; detail: string | null; createdAt: string; repliedAt: string | null };
type Page = { items: Row[]; total: number; page: number; totalPages: number };

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  SENT: { label: 'Messaged', cls: 'is-paid' }, FAILED: { label: 'Failed', cls: 'is-cancelled' }, SKIPPED: { label: 'Skipped', cls: 'is-muted' },
  RETRY: { label: 'Waiting to retry', cls: 'is-pending' }, PENDING: { label: 'Sending', cls: 'is-pending' },
};
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const muted = { color: 'var(--p-muted)' } as const;

export default function FacebookPage() {
  const { ready, isOwner } = useSession();
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<Page | null>(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (filter) q.set('status', filter);
      const [s, c] = await Promise.all([portalFetch('/portal/facebook/status'), portalFetch(`/portal/facebook/comments?${q.toString()}`)]);
      if (s.ok) setStatus(await s.json());
      if (c.ok) setRows(await c.json());
    } catch (e: any) { setError(e.message); }
  }, [filter, page]);

  useEffect(() => { if (ready && isOwner) void load(); }, [ready, isOwner, load]);

  if (!ready) return <p>Loading...</p>;
  if (!isOwner) return <OwnerOnlyNotice what="see your Facebook comments" />;

  return (
    <div>
      <div className="portal-page-head"><h3>Facebook comments</h3></div>
      {error ? <div className="portal-alert is-error">{error}</div> : null}
      <div className="portal-card" style={{ marginBottom: 20 }}>
        <p style={{ margin: '0 0 12px', fontSize: 13, ...muted }}>
          Everyone who comments on a post or ad on your Page gets one private message in Messenger (with your WhatsApp link and an invitation to follow the Page) and a short public reply. You answer their replies from your Page inbox in Meta Business Suite. Facebook only allows this for people who comment, within 7 days; people who only react cannot be messaged.
        </p>
        {!status ? <p>Loading...</p> : (
          <>
            <p style={{ margin: '0 0 12px' }}>
              <span className={`portal-badge ${status.connected ? 'is-paid' : 'is-muted'}`}>{status.connected ? 'Page connected' : 'Page not connected'}</span>
              <span className={`portal-badge ${status.enabled ? 'is-paid' : 'is-muted'}`} style={{ marginLeft: 8 }}>{status.enabled ? 'Replies on' : 'Replies off'}</span>
              {status.connected ? <span className={`portal-badge ${status.subscribed ? 'is-paid' : 'is-cancelled'}`} style={{ marginLeft: 8 }}>{status.subscribed ? 'Facebook is sending you comments' : 'Facebook is not sending you comments yet'}</span> : null}
            </p>
            {!status.connected ? <div className="portal-alert is-warn">Connect your Facebook Page under <Link href="/portal/integrations">Connections</Link> first.</div> : null}
            {status.connected && !status.enabled ? <div className="portal-alert is-warn">Replies are switched off. Turn on “Reply to people who comment on your Page” under <Link href="/portal/integrations">Connections</Link> when you are ready.</div> : null}
            {status.connected && !status.subscribed ? (
              <div className="portal-alert is-warn" style={{ marginTop: 8 }}>
                {status.subscriptionError ? `Facebook said: ${status.subscriptionError}. ` : ''}Press “Connect comments” under <Link href="/portal/integrations">Connections</Link> and paste the address into your Meta app (Webhooks &gt; Page, subscribe to “feed”).
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginTop: 12 }}>
              {([['Messaged', status.sent], ['Skipped', status.skipped], ['Failed', status.failed], ['Waiting', status.waiting]] as const).map(([label, n]) => (
                <div key={label}><div style={{ fontSize: 22, fontWeight: 600 }}>{n}</div><div style={{ fontSize: 12, ...muted }}>{label}</div></div>
              ))}
              <div><div style={{ fontSize: 22, fontWeight: 600 }}>{status.sentToday} / {status.dailyCap}</div><div style={{ fontSize: 12, ...muted }}>Messaged today</div></div>
            </div>
          </>
        )}
      </div>

      <div className="portal-card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[['', 'All'], ['SENT', 'Messaged'], ['SKIPPED', 'Skipped'], ['FAILED', 'Failed']].map(([v, label]) => (
            <button key={v} type="button" className={filter === v ? 'portal-btn' : 'portal-btn-outline portal-btn'} onClick={() => { setFilter(v); setPage(1); }}>{label}</button>
          ))}
        </div>
        {!rows ? <p>Loading...</p> : rows.items.length === 0 ? <p style={muted}>No comments yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table" style={{ width: '100%' }}>
              <thead><tr><th>Who</th><th>Comment</th><th>What happened</th><th>When</th></tr></thead>
              <tbody>
                {rows.items.map((r) => {
                  const s = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'is-muted' };
                  return (
                    <tr key={r.id}>
                      <td>{r.fromName || 'Someone'}</td>
                      <td style={{ fontSize: 13, maxWidth: 280, overflowWrap: 'anywhere' }}>{r.message ? `“${r.message.slice(0, 120)}”` : ''}</td>
                      <td><span className={`portal-badge ${s.cls}`}>{s.label}</span>{r.detail ? <div style={{ fontSize: 12, overflowWrap: 'anywhere', ...muted }}>{r.detail}</div> : null}</td>
                      <td style={{ fontSize: 13 }}>{when(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows && rows.totalPages > 1 ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <button type="button" className="portal-btn-outline portal-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span style={{ fontSize: 13, ...muted }}>Page {rows.page} of {rows.totalPages} ({rows.total} comments)</span>
            <button type="button" className="portal-btn-outline portal-btn" disabled={page >= rows.totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
