"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { OwnerOnlyNotice, useSession } from '../portal-session';

type Kind = 'GROUP' | 'REVIEW' | 'LOCATION' | 'RANGE';
type KindStatus = { kind: Kind; label: string; template: string | null; link: string | null; fixedText: boolean; ready: boolean; missing: string | null };
type Status = { configured: boolean; kinds: KindStatus[] };
type Person = { key: string; name: string; email: string | null; phone: string | null; usablePhone: boolean; lastOrderAt: string | null; sent: Partial<Record<Kind, string>> };
type Recipients = { customers: Person[]; total: number; page: number; totalPages: number };
type Result = { key: string; name: string; phone: string | null; outcome: 'SENT' | 'FAILED' | 'SKIPPED'; detail?: string };
type Contact = { id: string; phone: string; name: string | null; adHeadline: string | null; subscribed: boolean; unsubscribedReason: string | null; nextStep: number; noticeSentAt: string | null; lastMessageAt: string };
type Stats = { subscribed: number; stopped: number; inSequence: number; finished: number; autoSubscribe: boolean };
type HistoryRow = { id: string; name: string | null; phone: string; kind: Kind; status: 'SENT' | 'FAILED'; error: string | null; delivery: string | null; deliveryError: string | null; triggeredBy: string; createdAt: string };

const DELIVERY_LABEL: Record<string, string> = { sent: 'Reached WhatsApp', delivered: 'Delivered', read: 'Read', failed: 'Not delivered' };
const BATCH = 25;
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
const muted = { color: 'var(--p-muted)' } as const;

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const message = data?.message;
  return Array.isArray(message) ? message.join(' ') : message || fallback;
}

export default function WhatsappPage() {
  const { ready, isOwner } = useSession();
  const [status, setStatus] = useState<Status | null>(null);
  const [kind, setKind] = useState<Kind>('GROUP');
  const [people, setPeople] = useState<Recipients | null>(null);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [force, setForce] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatic = useCallback(async () => {
    try {
      const [s, st, c, h] = await Promise.all([
        portalFetch('/portal/whatsapp/status'), portalFetch('/portal/whatsapp/contacts/stats'),
        portalFetch('/portal/whatsapp/contacts?pageSize=15'), portalFetch('/portal/whatsapp/history?pageSize=15'),
      ]);
      if (s.ok) setStatus(await s.json());
      if (st.ok) setStats(await st.json());
      if (c.ok) setContacts((await c.json()).items);
      if (h.ok) setHistory((await h.json()).items);
    } catch (e: any) { setError(e.message); }
  }, []);

  const loadPeople = useCallback(async () => {
    const q = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (search) q.set('search', search);
    const res = await portalFetch(`/portal/whatsapp/recipients?${q.toString()}`);
    if (res.ok) setPeople(await res.json());
  }, [page, search]);

  useEffect(() => { if (ready && isOwner) void loadStatic(); }, [ready, isOwner, loadStatic]);
  useEffect(() => { if (ready && isOwner) void loadPeople(); }, [ready, isOwner, loadPeople]);

  if (!ready) return <p>Loading...</p>;
  if (!isOwner) return <OwnerOnlyNotice what="message your customers on WhatsApp" />;

  const current = status?.kinds.find((k) => k.kind === kind);
  const toggle = (key: string) => setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  async function selectUnsent() {
    setError(null);
    const q = new URLSearchParams({ kind });
    if (search) q.set('search', search);
    const res = await portalFetch(`/portal/whatsapp/unsent?${q.toString()}`);
    if (!res.ok) { setError(await errorOf(res, 'Could not list people')); return; }
    const data: { keys: string[]; capped: boolean } = await res.json();
    setSelected(new Set(data.keys));
    setNotice(`${data.keys.length} ${data.keys.length === 1 ? 'person has' : 'people have'} not received “${current?.label}” yet${data.capped ? ' (showing the first 1000)' : ''}.`);
  }

  async function onSend() {
    const keys = Array.from(selected);
    if (!keys.length || !current) return;
    if (!window.confirm(`Send “${current.label}” to ${keys.length} ${keys.length === 1 ? 'person' : 'people'} from your shop’s WhatsApp number?${force ? ' People who already received it will get it again.' : ' People who already received it are skipped.'}`)) return;
    setError(null); setNotice(null); setResults(null);
    const all: Result[] = [];
    setProgress({ done: 0, total: keys.length });
    try {
      for (let i = 0; i < keys.length; i += BATCH) {
        const res = await portalFetch('/portal/whatsapp/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, keys: keys.slice(i, i + BATCH), force }) });
        if (!res.ok) throw new Error(await errorOf(res, 'Could not send'));
        all.push(...(await res.json()).results);
        setProgress({ done: Math.min(i + BATCH, keys.length), total: keys.length });
      }
    } catch (e: any) {
      setError(`${e.message} ${all.length ? `(${all.length} were processed before it stopped.)` : ''}`);
    } finally {
      setProgress(null);
      setResults(all);
      setSelected(new Set());
      await Promise.all([loadPeople(), loadStatic()]);
    }
  }

  async function unsubscribe(c: Contact) {
    if (!window.confirm(`Unsubscribe ${c.name || c.phone}? They will not get any more messages. Use this when they ask you another way.`)) return;
    const res = await portalFetch(`/portal/whatsapp/contacts/${c.id}/unsubscribe`, { method: 'POST' });
    if (!res.ok) { setError(await errorOf(res, 'Could not unsubscribe')); return; }
    await loadStatic();
  }

  const count = (o: Result['outcome']) => results?.filter((r) => r.outcome === o).length ?? 0;

  return (
    <div>
      <div className="portal-page-head"><h3>WhatsApp</h3></div>
      {error ? <div className="portal-alert is-error">{error}</div> : null}
      {notice ? <div className="portal-alert is-success">{notice}</div> : null}
      {status && !status.configured ? (
        <div className="portal-alert is-warn" style={{ marginBottom: 16 }}>WhatsApp is not connected for this shop, so nothing can be sent. Connect your number under <Link href="/portal/integrations">Connections</Link> and switch it on.</div>
      ) : null}

      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4 style={{ marginTop: 0 }}>Send a message</h4>
        <p style={{ margin: '0 0 12px', fontSize: 13, ...muted }}>
          Each message is an approved WhatsApp template, sent from your shop’s own number. Someone who already received it is skipped, and nobody who replied STOP is ever messaged.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          {status?.kinds.map((k) => (
            <button key={k.kind} type="button" className={kind === k.kind ? 'portal-btn' : 'portal-btn-outline portal-btn'} onClick={() => { setKind(k.kind); setSelected(new Set()); setResults(null); }}>{k.label}</button>
          ))}
        </div>
        {current ? (
          <p style={{ margin: '4px 0 12px', fontSize: 13, color: current.ready ? 'var(--p-muted)' : 'var(--p-danger, #b42318)' }}>
            {current.ready ? `Template “${current.template}”${current.link ? `, with ${current.link}` : ''}.` : current.missing}
          </p>
        ) : null}

        <form style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}>
          <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search customers by name, email or phone..." aria-label="Search customers" style={{ flex: 1, minWidth: 200 }} />
          <button type="submit" className="portal-btn">Search</button>
          {search ? <button type="button" className="portal-btn-ghost" onClick={() => { setSearchDraft(''); setSearch(''); setPage(1); }}>Clear</button> : null}
        </form>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <button type="button" className="portal-btn-outline portal-btn" disabled={!current?.ready} onClick={() => void selectUnsent()}>Select everyone who hasn’t received it</button>
          {selected.size ? <button type="button" className="portal-btn-ghost" onClick={() => setSelected(new Set())}>Clear selection ({selected.size})</button> : null}
          <label style={{ fontSize: 13, display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} style={{ width: 'auto' }} /> Send again to people who already have it</label>
        </div>

        {!people ? <p>Loading...</p> : people.customers.length === 0 ? <p style={muted}>No customers found.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table" style={{ width: '100%' }}>
              <thead><tr><th style={{ width: 32 }} /><th>Customer</th><th>Phone</th><th>Got “{current?.label}”</th></tr></thead>
              <tbody>
                {people.customers.map((p) => (
                  <tr key={p.key}>
                    <td><input type="checkbox" aria-label={`Select ${p.name}`} disabled={!p.usablePhone} checked={selected.has(p.key)} onChange={() => toggle(p.key)} style={{ width: 'auto' }} /></td>
                    <td>{p.name || p.email || 'Unnamed'}</td>
                    <td>{p.usablePhone ? p.phone : <span style={muted}>{p.phone ? 'Not a usable number' : 'No phone'}</span>}</td>
                    <td>{p.sent[kind] ? <span className="portal-badge is-paid">{when(p.sent[kind]!)}</span> : <span style={muted}>Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {people && people.totalPages > 1 ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <button type="button" className="portal-btn-outline portal-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span style={{ fontSize: 13, ...muted }}>Page {people.page} of {people.totalPages} ({people.total} people)</span>
            <button type="button" className="portal-btn-outline portal-btn" disabled={page >= people.totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        ) : null}

        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="portal-btn" disabled={!selected.size || !current?.ready || progress !== null} onClick={() => void onSend()}>
            {progress ? `Sending ${progress.done} of ${progress.total}...` : `Send to ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`}
          </button>
        </div>

        {results ? (
          <div style={{ marginTop: 16 }}>
            <strong>{count('SENT')} sent, {count('FAILED')} failed, {count('SKIPPED')} skipped</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {results.filter((r) => r.outcome !== 'SENT').map((r) => <li key={r.key}>{r.name} {r.phone ? `(${r.phone})` : ''}: {r.outcome === 'FAILED' ? 'failed' : 'skipped'}{r.detail ? ` — ${r.detail}` : ''}</li>)}
            </ul>
          </div>
        ) : null}
        <p style={{ margin: '14px 0 0', fontSize: 12, ...muted }}>“Sent” means WhatsApp accepted the message. Whether it arrived is shown under Recent messages once WhatsApp reports back.</p>
      </div>

      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4 style={{ marginTop: 0 }}>People who messaged you</h4>
        <p style={{ margin: '0 0 12px', fontSize: 13, ...muted }}>
          {stats?.autoSubscribe
            ? 'Anyone who writes to your number is told they will get updates (and that STOP opts out), then gets the welcome series: the group link, then the Google rating request, a day or more apart, between 08:00 and 20:00.'
            : <>The welcome series is off. Turn on “Welcome people who message you” under <Link href="/portal/integrations">Connections</Link> to start it. STOP and START replies are always honoured.</>}
        </p>
        {stats ? (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            {[['Subscribed', stats.subscribed], ['Still getting messages', stats.inSequence], ['Finished the series', stats.finished], ['Replied STOP', stats.stopped]].map(([label, n]) => (
              <div key={label as string}><div style={{ fontSize: 22, fontWeight: 600 }}>{n}</div><div style={{ fontSize: 12, ...muted }}>{label}</div></div>
            ))}
          </div>
        ) : null}
        {contacts.length === 0 ? <p style={muted}>Nobody has messaged you yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table" style={{ width: '100%' }}>
              <thead><tr><th>Person</th><th>Came from</th><th>Status</th><th>Last message</th><th /></tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name || c.phone}<div style={{ fontSize: 12, ...muted }}>{c.name ? c.phone : ''}</div></td>
                    <td style={{ fontSize: 13 }}>{c.adHeadline || <span style={muted}>Not from an ad</span>}</td>
                    <td>{c.subscribed ? <span className="portal-badge is-paid">Subscribed</span> : <span className="portal-badge is-cancelled">Replied STOP</span>}</td>
                    <td style={{ fontSize: 13 }}>{when(c.lastMessageAt)}</td>
                    <td>{c.subscribed ? <button type="button" className="portal-btn-ghost" onClick={() => void unsubscribe(c)}>Unsubscribe</button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="portal-card">
        <h4 style={{ marginTop: 0 }}>Recent messages</h4>
        {history.length === 0 ? <p style={muted}>Nothing sent yet.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table" style={{ width: '100%' }}>
              <thead><tr><th>To</th><th>Message</th><th>Result</th><th>When</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.name || h.phone}<div style={{ fontSize: 12, ...muted }}>{h.name ? h.phone : ''}</div></td>
                    <td style={{ fontSize: 13 }}>{status?.kinds.find((k) => k.kind === h.kind)?.label ?? h.kind}</td>
                    <td>
                      <span className={`portal-badge ${h.status === 'SENT' ? 'is-paid' : 'is-cancelled'}`}>{h.status === 'SENT' ? 'Accepted' : 'Failed'}</span>
                      {h.delivery ? <span className={`portal-badge ${h.delivery === 'failed' ? 'is-cancelled' : h.delivery === 'sent' ? 'is-muted' : 'is-paid'}`} style={{ marginLeft: 6 }}>{DELIVERY_LABEL[h.delivery] ?? h.delivery}</span> : null}
                      {h.error || h.deliveryError ? <div style={{ fontSize: 12, ...muted }}>{h.deliveryError || h.error}</div> : null}
                    </td>
                    <td style={{ fontSize: 13 }}>{when(h.createdAt)}<div style={{ fontSize: 12, ...muted }}>{h.triggeredBy === 'whatsapp-subscription' ? 'welcome series' : `by ${h.triggeredBy}`}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
