"use client";

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { OwnerOnlyNotice, useSession } from '../portal-session';

type Settings = {
  enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[];
  isCustomised: boolean; scheduled: boolean; whatsappConfigured: boolean; whatsappSource: 'shop' | 'platform' | null; whatsappTemplate: string;
};
type Run = { id: string; reportDate: string; channel: 'EMAIL' | 'WHATSAPP'; recipient: string; status: string; attempts: number; error?: string | null; updatedAt: string };
type Preview = { report: { label: string; shopName: string }; email: { subject: string }; whatsappParameters: string[] };
type Delivery = { dateKey: string; skipped?: string; email: Array<{ recipient: string; status: string; error?: string }>; whatsapp: Array<{ recipient: string; status: string; error?: string }> };

/** The approved template's wording, so the owner can read the message as the recipient will. Matches `daily_report` in WhatsApp Manager. */
const TEMPLATE_TEXT = 'Daily report for {{1}} ({{2}}): {{3}} paid orders, {{4}} revenue, {{5}} vs the day before. To act on: {{6}}. Full report is in your email.';
const fillTemplate = (p: string[]) => TEMPLATE_TEXT.replace(/\{\{(\d)\}\}/g, (_, i) => p[Number(i) - 1] ?? '');

const STATUS_LABEL: Record<string, string> = { SENT: 'Sent', FAILED: 'Failed', SKIPPED: 'Not sent', PENDING: 'Sending', ALREADY_SENT: 'Already sent', GAVE_UP: 'Gave up' };
const STATUS_CLASS: Record<string, string> = { SENT: 'is-paid', FAILED: 'is-cancelled', SKIPPED: 'is-muted', PENDING: 'is-pending', ALREADY_SENT: 'is-muted', GAVE_UP: 'is-cancelled' };
const Status = ({ status }: { status: string }) => <span className={`portal-badge ${STATUS_CLASS[status] ?? 'is-muted'}`}>{STATUS_LABEL[status] ?? status}</span>;

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const message = data?.message;
  return Array.isArray(message) ? message.join(' ') : message || fallback;
}

/** One list of recipients: chips with a remove button, plus a box to add another. */
function RecipientList({ label, hint, values, onChange, placeholder, type }: {
  label: string; hint: string; values: string[]; onChange: (next: string[]) => void; placeholder: string; type: 'email' | 'tel';
}) {
  const [draft, setDraft] = useState('');
  function add(e: FormEvent) {
    e.preventDefault();
    const value = draft.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setDraft('');
  }
  return (
    <div style={{ marginTop: 18 }}>
      <strong>{label}</strong>
      <p style={{ margin: '2px 0 8px', fontSize: 13, color: 'var(--p-muted)' }}>{hint}</p>
      {values.length === 0 ? <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--p-muted)' }}>Nobody. This channel will not send.</p> : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {values.map((v) => (
            <span key={v} className="portal-badge is-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={add} style={{ display: 'flex', gap: 8, maxWidth: 420 }}>
        <input type={type} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={`Add to ${label}`} style={{ flex: 1 }} />
        <button type="submit" className="portal-btn-outline portal-btn portal-btn-sm" disabled={!draft.trim()}>Add</button>
      </form>
    </div>
  );
}

// Who gets the morning report, what it will say, and what has been sent. The report itself is built and sent by the server
// (backend/src/daily-report); this screen edits the recipients and lets the owner look at it or send it now.
export default function DailyReportPage() {
  const { ready, isOwner } = useSession();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<{ enabled: boolean; emailRecipients: string[]; whatsappRecipients: string[] } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [busy, setBusy] = useState<'save' | 'preview' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([portalFetch('/portal/daily-report/settings'), portalFetch('/portal/daily-report/runs')]);
    if (s.ok) {
      const data: Settings = await s.json();
      setSettings(data);
      setDraft({ enabled: data.enabled, emailRecipients: data.emailRecipients, whatsappRecipients: data.whatsappRecipients });
    } else setError(await errorOf(s, 'Could not load the settings'));
    if (r.ok) setRuns(await r.json());
  }, []);
  useEffect(() => { if (isOwner) void load(); }, [isOwner, load]);

  if (!ready) return <p>Loading...</p>;
  if (!isOwner) return <OwnerOnlyNotice what="see or change the daily report" />;
  if (!settings || !draft) return error ? <div className="portal-alert is-error">{error}</div> : <p>Loading...</p>;

  const changed = draft.enabled !== settings.enabled
    || JSON.stringify(draft.emailRecipients) !== JSON.stringify(settings.emailRecipients)
    || JSON.stringify(draft.whatsappRecipients) !== JSON.stringify(settings.whatsappRecipients);

  async function onSave() {
    setBusy('save'); setError(null); setNotice(null);
    try {
      const res = await portalFetch('/portal/daily-report/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not save'));
      const saved: Settings = await res.json();
      setSettings(saved);
      setDraft({ enabled: saved.enabled, emailRecipients: saved.emailRecipients, whatsappRecipients: saved.whatsappRecipients });
      setNotice('Saved. The next report uses these recipients.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function onPreview() {
    setBusy('preview'); setError(null);
    try {
      const res = await portalFetch('/portal/daily-report/preview');
      if (!res.ok) throw new Error(await errorOf(res, 'Could not build the report'));
      setPreview(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function onSend(force: boolean) {
    const who = [...settings!.whatsappRecipients, ...settings!.emailRecipients];
    const text = who.length
      ? `Send ${force ? 'the report again' : 'yesterday’s report now'} to ${who.join(', ')}?${force ? ' Anyone who already received it gets it a second time.' : ' Anyone who already received it is skipped.'}`
      : 'There are no recipients saved, so nothing would be sent.';
    if (!window.confirm(text)) return;
    setBusy('send'); setError(null);
    try {
      const res = await portalFetch(`/portal/daily-report/send${force ? '?force=true' : ''}`, { method: 'POST' });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not send'));
      setDelivery(await res.json());
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const results = delivery ? [...delivery.whatsapp, ...delivery.email] : [];
  const anyAlready = results.some((r) => r.status === 'ALREADY_SENT');

  return (
    <div>
      <div className="portal-page-head"><h3>Daily report</h3></div>
      {error ? <div className="portal-alert is-error">{error}</div> : null}
      {notice ? <div className="portal-alert is-success">{notice}</div> : null}

      <div className="portal-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h4 style={{ margin: 0 }}>Who gets it</h4>
          <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 14, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} style={{ width: 'auto' }} />
            Send the report every morning
          </label>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--p-muted)' }}>
          Sent each morning at 07:00 (Nairobi time) with yesterday&apos;s sales, how they compare, and what needs doing.
          {!settings.isCustomised ? ' Nothing has been saved here yet, so the shop notification email (or the owners) would be used. Saving starts the morning report and replaces that.' : ''}
        </p>
        {!settings.scheduled ? <div className="portal-alert is-warn" style={{ marginTop: 12 }}>The morning report is not switched on for this shop, so nothing is sent automatically. Save these settings with “Send the report every morning” ticked to start it. “Send now” below works either way.</div> : null}
        {!settings.whatsappConfigured ? <div className="portal-alert is-warn" style={{ marginTop: 12 }}>WhatsApp is not connected, so WhatsApp recipients are skipped (email still goes). Connect your number under <Link href="/portal/integrations">Connections</Link>.</div> : null}
        {settings.whatsappSource === 'platform' ? <div className="portal-alert is-warn" style={{ marginTop: 12 }}>WhatsApp reports are sent from the platform’s number until you connect your own under <Link href="/portal/integrations">Connections</Link>.</div> : null}

        <RecipientList label="WhatsApp" hint={`Numbers in any usual format, for example 0712 345 678. Sent with the approved template “${settings.whatsappTemplate}”.`}
          values={draft.whatsappRecipients} onChange={(next) => setDraft({ ...draft, whatsappRecipients: next })} placeholder="0712 345 678" type="tel" />
        <RecipientList label="Email" hint="The full report, with the orders to act on and the restock list."
          values={draft.emailRecipients} onChange={(next) => setDraft({ ...draft, emailRecipients: next })} placeholder="name@example.com" type="email" />

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button type="button" className="portal-btn" disabled={!changed || busy === 'save'} onClick={() => void onSave()}>{busy === 'save' ? 'Saving...' : 'Save'}</button>
          {changed ? <button type="button" className="portal-btn-ghost" onClick={() => setDraft({ enabled: settings.enabled, emailRecipients: settings.emailRecipients, whatsappRecipients: settings.whatsappRecipients })}>Undo changes</button> : null}
        </div>
      </div>

      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4 style={{ marginTop: 0 }}>See it, or send it now</h4>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="portal-btn-outline portal-btn" disabled={busy === 'preview'} onClick={() => void onPreview()}>{busy === 'preview' ? 'Building...' : 'Preview yesterday’s report'}</button>
          <button type="button" className="portal-btn" disabled={busy === 'send' || changed} onClick={() => void onSend(false)}>{busy === 'send' ? 'Sending...' : 'Send now'}</button>
        </div>
        {changed ? <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--p-muted)' }}>Save your changes first, so the report goes to the list shown above.</p> : null}

        {preview ? (
          <div style={{ marginTop: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--p-muted)' }}>{preview.report.label}. Nothing was sent.</p>
            <strong>WhatsApp</strong>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '4px 0 12px', padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 14 }}>{fillTemplate(preview.whatsappParameters)}</pre>
            <strong>Email subject</strong>
            <p style={{ margin: '4px 0 0' }}>{preview.email.subject}</p>
          </div>
        ) : null}

        {delivery ? (
          <div style={{ marginTop: 16 }}>
            <strong>{delivery.skipped ? `Not sent: ${delivery.skipped}` : `Report for ${delivery.dateKey}`}</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {results.map((r) => (
                <li key={`${r.recipient}-${r.status}`}>{r.recipient} <Status status={r.status} />{r.error ? <span style={{ color: 'var(--p-muted)', fontSize: 13 }}> {r.error}</span> : null}</li>
              ))}
            </ul>
            {anyAlready ? <button type="button" className="portal-btn-outline portal-btn portal-btn-sm" style={{ marginTop: 10 }} disabled={busy === 'send'} onClick={() => void onSend(true)}>Send again anyway</button> : null}
          </div>
        ) : null}
      </div>

      <div className="portal-card" style={{ padding: 0, overflowX: 'auto' }}>
        <h4 style={{ margin: 0, padding: '16px 18px 0' }}>What has been sent</h4>
        {runs.length === 0 ? <p style={{ padding: '10px 18px 16px', fontSize: 13, color: 'var(--p-muted)' }}>Nothing yet.</p> : (
          <table className="portal-table">
            <thead><tr><th>Report for</th><th>Channel</th><th>To</th><th>Result</th><th>When</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.reportDate}</td>
                  <td>{r.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}</td>
                  <td>{r.recipient}</td>
                  <td><Status status={r.status} />{r.error ? <div style={{ fontSize: 12, color: 'var(--p-muted)', whiteSpace: 'normal', maxWidth: 360 }}>{r.error}</div> : null}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
