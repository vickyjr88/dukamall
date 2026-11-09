"use client";

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { OwnerOnlyNotice, useSession } from '../portal-session';

type Channel = 'FACEBOOK' | 'THREADS';
type ChannelStatus = { connected: boolean; enabled: boolean; nextPostAt: string | null; posted: number; failed: number; skipped: number; removed: number };
type Status = {
  allowed: boolean; times: string[]; cooldownDays: number; updatedBy: string;
  facebook: ChannelStatus; threads: ChannelStatus & { tokenExpiresAt: string | null; tokenError: string | null };
};
type Preview = { product: { id: string; name: string; slug: string; imageUrl: string; brand: string | null } | null; caption: string | null };
type Post = {
  id: string; channel: Channel; productName: string | null; imageUrl: string | null; status: string; detail: string | null;
  externalId: string | null; permalink: string | null; postedAt: string | null; triggeredBy: string; createdAt: string;
};
type PostPage = { items: Post[]; total: number; page: number; totalPages: number };

const LABEL: Record<Channel, string> = { FACEBOOK: 'Facebook Page', THREADS: 'Threads' };
const SHORT: Record<Channel, string> = { FACEBOOK: 'Facebook', THREADS: 'Threads' };
const STATUS: Record<string, { label: string; cls: string }> = {
  POSTED: { label: 'Posted', cls: 'is-paid' }, FAILED: { label: 'Failed', cls: 'is-cancelled' }, RETRY: { label: 'Retrying', cls: 'is-pending' },
  PENDING: { label: 'Posting', cls: 'is-pending' }, SKIPPED: { label: 'Skipped', cls: 'is-muted' }, REMOVED: { label: 'Taken down', cls: 'is-muted' },
};
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const muted = { color: 'var(--p-muted)' } as const;

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const message = data?.message;
  return Array.isArray(message) ? message.join(' ') : message || fallback;
}

export default function SocialPage() {
  const { ready, isOwner } = useSession();
  const [status, setStatus] = useState<Status | null>(null);
  const [times, setTimes] = useState<string[]>([]);
  const [draftTime, setDraftTime] = useState('');
  const [posts, setPosts] = useState<PostPage | null>(null);
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Record<Channel, Preview> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([portalFetch('/portal/social/status'), portalFetch(`/portal/social/posts?page=${page}&pageSize=15`)]);
      if (s.ok) { const data: Status = await s.json(); setStatus(data); setTimes(data.times); }
      if (p.ok) setPosts(await p.json());
    } catch (e: any) { setError(e.message); }
  }, [page]);

  useEffect(() => { if (ready && isOwner) void load(); }, [ready, isOwner, load]);

  if (!ready) return <p>Loading...</p>;
  if (!isOwner) return <OwnerOnlyNotice what="post to your Facebook Page and Threads" />;

  async function save(patch: Record<string, unknown>, message: string, key: string) {
    setBusy(key); setError(null); setNotice(null);
    try {
      const res = await portalFetch('/portal/social/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not save'));
      const data: Status = await res.json();
      setStatus(data); setTimes(data.times); setNotice(message);
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function toggle(channel: Channel, on: boolean) {
    if (!status) return;
    if (on && !window.confirm(`Start posting to ${LABEL[channel]} automatically?\n\nFrom the next set time (${status.times.join(', ')} Nairobi time) a product that is in stock is posted with no one checking it first, up to ${status.times.length} a day. Every post is public, in your shop's name. You can pause it here at any time and take a post down from the list below.`)) return;
    await save(channel === 'FACEBOOK' ? { facebookEnabled: on } : { threadsEnabled: on }, `${SHORT[channel]}: automatic posting is ${on ? 'on' : 'paused'}.`, `toggle-${channel}`);
  }

  function addTime(e: FormEvent) {
    e.preventDefault();
    const value = draftTime.trim();
    if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) { setError('Enter a time like 09:30.'); return; }
    const padded = value.length === 4 ? `0${value}` : value;
    if (!times.includes(padded)) setTimes([...times, padded].sort().slice(0, 6));
    setDraftTime('');
  }

  async function onPreview() {
    setBusy('preview'); setError(null);
    try {
      const res = await portalFetch('/portal/social/preview');
      if (!res.ok) throw new Error(await errorOf(res, 'Could not choose a product'));
      setPreview((await res.json()).previews);
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function postNow(channel: Channel) {
    const shown = preview?.[channel]?.product ?? null;
    if (!window.confirm(`Post to ${LABEL[channel]} now?\n\n${shown ? `“${shown.name}” will be posted publicly right now, as shown in the preview.` : 'The next product will be chosen and posted publicly right now.'}`)) return;
    setBusy(`post-${channel}`); setError(null); setNotice(null);
    try {
      const res = await portalFetch('/portal/social/post-now', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, ...(shown ? { productId: shown.id } : {}) }) });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not post'));
      const result: { status: string; detail?: string | null; productName?: string | null } = await res.json();
      if (result.status === 'POSTED') setNotice(`Posted to ${SHORT[channel]}${result.productName ? `: ${result.productName}` : ''}.`);
      else setError(`Not posted: ${result.detail || result.status}`);
      setPreview(null);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function remove(post: Post) {
    if (!window.confirm(`Take this post down?\n\n“${post.productName ?? 'This post'}” will be deleted from ${LABEL[post.channel]}, with its likes and comments.`)) return;
    const res = await portalFetch(`/portal/social/posts/${post.id}`, { method: 'DELETE' });
    if (!res.ok) { setError(await errorOf(res, 'Could not take it down')); return; }
    const result: { removed: boolean; detail: string | null } = await res.json();
    if (result.removed) setNotice('Taken down.'); else setError(result.detail || 'Could not take it down.');
    await load();
  }

  const timesChanged = status ? JSON.stringify(times) !== JSON.stringify(status.times) : false;

  return (
    <div>
      <div className="portal-page-head"><h3>Social posting</h3></div>
      {error ? <div className="portal-alert is-error">{error}</div> : null}
      {notice ? <div className="portal-alert is-success">{notice}</div> : null}
      {!status ? <p>Loading...</p> : (
        <>
          <div className="portal-card" style={{ marginBottom: 20 }}>
            <h4 style={{ marginTop: 0 }}>Automatic posting</h4>
            <p style={{ margin: '0 0 12px', fontSize: 13, ...muted }}>
              At each time below, a product that is in stock, has a photo and has not been posted lately goes out: its photo, price, what is in stock (sizes, colours or storage), a link to it, your WhatsApp and your address.
              Visits from these links show in Analytics as Facebook or Threads. Nothing is checked by a person first, so each channel stays off until you turn it on.
            </p>
            {!status.allowed ? <div className="portal-alert is-error">Posting is switched off on this server, whatever is set here.</div> : null}

            {(['FACEBOOK', 'THREADS'] as Channel[]).map((channel) => {
              const c = channel === 'FACEBOOK' ? status.facebook : status.threads;
              const live = c.enabled && c.connected && status.allowed;
              return (
                <div key={channel} style={{ borderTop: '1px solid var(--p-border, #e5e5e5)', paddingTop: 14, marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <strong>{LABEL[channel]}</strong>
                    <span className={`portal-badge ${live ? 'is-paid' : 'is-muted'}`}>{!c.connected ? 'Not connected' : !status.allowed ? 'Off on this server' : c.enabled ? 'On' : 'Paused'}</span>
                  </div>
                  {!c.connected ? <p style={{ margin: '8px 0 0', fontSize: 13 }}>Connect it under <Link href="/portal/integrations">Connections</Link> first.</p> : null}
                  {channel === 'THREADS' && status.threads.connected ? (
                    <p style={{ margin: '8px 0 0', fontSize: 13, ...muted }}>
                      {status.threads.tokenExpiresAt ? `Your Threads login renews itself; good until ${when(status.threads.tokenExpiresAt)}.` : 'Your Threads login’s end date is not known yet (checked every few minutes).'}
                      {status.threads.tokenError ? ` ${status.threads.tokenError}` : ''}
                    </p>
                  ) : null}
                  <p style={{ margin: '8px 0 0', fontSize: 13, ...muted }}>
                    {c.posted} posted, {c.failed} failed, {c.skipped} skipped{c.removed ? `, ${c.removed} taken down` : ''}.
                    {c.nextPostAt ? <> Next post: <strong>{when(c.nextPostAt)}</strong>.</> : ''}
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className={c.enabled ? 'portal-btn-outline portal-btn' : 'portal-btn'} disabled={!c.connected || busy === `toggle-${channel}`} onClick={() => void toggle(channel, !c.enabled)}>
                      {busy === `toggle-${channel}` ? 'Saving...' : c.enabled ? 'Pause posting' : 'Start posting'}
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ marginTop: 18, borderTop: '1px solid var(--p-border, #e5e5e5)', paddingTop: 14 }}>
              <strong>Times (Nairobi), the same for both</strong>
              <p style={{ margin: '2px 0 0', fontSize: 13, ...muted }}>A product is not posted again to the same channel for {status.cooldownDays} days.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
                {times.length === 0 ? <span style={muted}>None: nothing will be posted.</span> : times.map((t) => (
                  <span key={t} className="portal-badge is-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => setTimes(times.filter((x) => x !== t))} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
              <form onSubmit={addTime} style={{ display: 'flex', gap: 8, maxWidth: 320 }}>
                <input value={draftTime} onChange={(e) => setDraftTime(e.target.value)} placeholder="09:30" aria-label="Add a time" disabled={times.length >= 6} />
                <button type="submit" className="portal-btn-outline portal-btn" disabled={!draftTime.trim() || times.length >= 6}>Add</button>
              </form>
              {timesChanged ? (
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button type="button" className="portal-btn" disabled={busy === 'times'} onClick={() => void save({ times }, 'Saved. The next post follows these times.', 'times')}>{busy === 'times' ? 'Saving...' : 'Save times'}</button>
                  <button type="button" className="portal-btn-ghost" onClick={() => setTimes(status.times)}>Undo</button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="portal-card" style={{ marginBottom: 20 }}>
            <h4 style={{ marginTop: 0 }}>See the next posts, or post now</h4>
            <button type="button" className="portal-btn-outline portal-btn" disabled={busy === 'preview'} onClick={() => void onPreview()}>{busy === 'preview' ? 'Choosing...' : 'Preview the next posts'}</button>
            {preview ? (['FACEBOOK', 'THREADS'] as Channel[]).map((channel) => {
              const p = preview[channel];
              const c = channel === 'FACEBOOK' ? status.facebook : status.threads;
              return (
                <div key={channel} style={{ marginTop: 18 }}>
                  <strong>{LABEL[channel]}</strong>
                  {p?.product ? (
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.product.imageUrl} alt={p.product.name} style={{ width: 160, height: 160, objectFit: 'cover', borderRadius: 8 }} />
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <p style={{ margin: 0, fontSize: 13, ...muted }}>This is what would be posted. Nothing has been posted yet.</p>
                        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', margin: '8px 0', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 14 }}>{p.caption}</pre>
                        <button type="button" className="portal-btn" disabled={busy === `post-${channel}` || !c.connected || !status.allowed} onClick={() => void postNow(channel)}>
                          {busy === `post-${channel}` ? 'Posting...' : `Post to ${SHORT[channel]} now`}
                        </button>
                      </div>
                    </div>
                  ) : <p style={{ marginTop: 8, ...muted }}>No product is ready: none is in stock with a photo that has not been posted lately.</p>}
                </div>
              );
            }) : <p style={{ margin: '12px 0 0', fontSize: 13, ...muted }}>Preview first, then post exactly what you saw.</p>}
          </div>

          <div className="portal-card">
            <h4 style={{ marginTop: 0 }}>Posts</h4>
            {!posts || posts.items.length === 0 ? <p style={muted}>Nothing has been posted yet.</p> : (
              <div>
                {posts.items.map((p) => {
                  const s = STATUS[p.status] ?? { label: p.status, cls: 'is-muted' };
                  return (
                    <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--p-border, #eee)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} /> : null}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{p.productName ?? 'No product'}</strong>
                        <span className="portal-badge is-muted" style={{ marginLeft: 8 }}>{SHORT[p.channel]}</span>
                        <span className={`portal-badge ${s.cls}`} style={{ marginLeft: 8 }}>{s.label}</span>
                        <p style={{ margin: '2px 0 0', fontSize: 13, overflowWrap: 'anywhere', ...muted }}>{when(p.postedAt ?? p.createdAt)} · {p.triggeredBy === 'schedule' ? 'scheduled' : `by ${p.triggeredBy}`}{p.detail ? ` · ${p.detail}` : ''}</p>
                        {p.status === 'POSTED' && p.externalId ? (
                          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                            <a href={p.permalink || `https://www.facebook.com/${p.externalId}`} target="_blank" rel="noreferrer">View on {SHORT[p.channel]}</a>
                            {' · '}<button type="button" className="portal-btn-ghost" onClick={() => void remove(p)}>Take down</button>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {posts && posts.totalPages > 1 ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                <button type="button" className="portal-btn-outline portal-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span style={{ fontSize: 13, ...muted }}>Page {posts.page} of {posts.totalPages}</span>
                <button type="button" className="portal-btn-outline portal-btn" disabled={page >= posts.totalPages} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
