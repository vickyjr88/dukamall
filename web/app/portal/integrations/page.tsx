"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { OwnerOnlyNotice, useSession } from '../portal-session';

type Field = {
  key: string; label: string; kind: 'config' | 'secret'; required: boolean; help: string; placeholder: string | null;
  value: string | null; default: string | null; set: boolean; hint: string | null;
};
type Connection = {
  provider: 'WHATSAPP' | 'FACEBOOK' | 'THREADS'; label: string; description: string; enabled: boolean; connected: boolean; fields: Field[];
  lastCheckedAt: string | null; lastError: string | null; tokenExpiresAt: string | null; ownerNoticesVia: 'platform' | null; webhookConfigured: boolean;
};
type Listing = { encryptionConfigured: boolean; connections: Connection[] };
type Draft = { enabled: boolean; config: Record<string, string>; secrets: Record<string, string> };
type TestResult = { ok: boolean; message: string; details?: Record<string, unknown> };

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const message = data?.message;
  return Array.isArray(message) ? message.join(' ') : message || fallback;
}

/**
 * What the owner does in Meta's dashboards, in the order they do it. Every shop has its own Meta app, so each of these starts with
 * "your app". Written for someone who has never opened the Meta developer site: no step assumes a term was explained elsewhere.
 */
const GUIDES: Record<Connection['provider'], { intro: string; steps: string[] }> = {
  WHATSAPP: {
    intro: 'You need a Meta developer app, a WhatsApp Business Account with a number, and a permanent token.',
    steps: [
      'Go to developers.facebook.com, create an app (type Business) and add the WhatsApp product. Copy the app’s ID from Settings > Basic.',
      'In WhatsApp > API setup, add your business number. Copy the Phone number ID (an id, not the phone number) and the WhatsApp Business Account ID.',
      'Add a payment method to the WhatsApp Business Account. Without one, messages are accepted and then fail with “payment” errors.',
      'In business.facebook.com > Business settings > System users, add a system user, give it your WhatsApp account, and generate a token with whatsapp_business_messaging and whatsapp_business_management. Paste it here. It does not expire.',
      'In WhatsApp Manager, create and get approved the message templates you will use. The daily report needs one named like the template name above, with 6 variables.',
      'Press Test connection. It should show your number and its name.',
    ],
  },
  FACEBOOK: {
    intro: 'You need a Facebook Page, your Meta app with the Page permissions, and the Page’s own token.',
    steps: [
      'Open your Page > About > Page transparency and copy the Page ID.',
      'In business.facebook.com > Business settings > System users, give a system user your Page (full control) and your app, and generate a token with pages_show_list, pages_read_engagement, pages_messaging, pages_manage_metadata, pages_manage_engagement and pages_manage_posts. A permission that is missing from the list is not enabled on your app: add it under the app’s Use cases first.',
      'Turn that into the Page’s own token: in the Graph API Explorer, with the system user token, request /YOUR_PAGE_ID?fields=access_token. Paste the access_token it returns here. It does not expire.',
      'Until your app has Advanced Access (App Review), Facebook only works for people who have a role on the app. Test with them.',
      'Press Test connection. It should show your Page’s name and say whether comments are being sent to your shop.',
    ],
  },
  THREADS: {
    intro: 'Threads has its own login, separate from Facebook. You need the Threads use case on your app and your Threads account added as a tester.',
    steps: [
      'In your Meta app, add the use case “Access the Threads API”. Copy the Threads app ID and secret from its settings (they are not the same as the Facebook app’s).',
      'Under App roles, add your shop’s Threads account as a Threads Tester, then accept the invitation in the Threads app (Settings > Account > Website permissions > Invites).',
      'In the Threads use case, use the user token generator for that account and paste the token here. Facebook tokens do not work for Threads.',
      'Press Test connection. It finds your account and shows how many posts you have left today.',
      'The token lasts 60 days; your shop renews it automatically.',
    ],
  },
};

function when(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : null;
}

function ConnectionCard({ c, onSaved }: { c: Connection; onSaved: (listing: Listing) => void }) {
  const [draft, setDraft] = useState<Draft>({ enabled: c.enabled, config: {}, secrets: {} });
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => { setDraft({ enabled: c.enabled, config: {}, secrets: {} }); }, [c]);

  const typedConfig = Object.entries(draft.config).filter(([k, v]) => v !== (c.fields.find((f) => f.key === k)?.value ?? ''));
  const typedSecrets = Object.entries(draft.secrets).filter(([, v]) => v.trim() !== '');
  const changed = draft.enabled !== c.enabled || typedConfig.length > 0 || typedSecrets.length > 0;

  async function save() {
    setBusy('save'); setError(null); setNotice(null); setResult(null);
    try {
      const body = { enabled: draft.enabled, config: Object.fromEntries(typedConfig), secrets: Object.fromEntries(typedSecrets) };
      const res = await portalFetch(`/portal/integrations/${c.provider.toLowerCase()}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not save'));
      onSaved(await res.json());
      setNotice('Saved.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test'); setError(null); setNotice(null); setResult(null);
    try {
      const res = await portalFetch(`/portal/integrations/${c.provider.toLowerCase()}/test`, { method: 'POST' });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not test'));
      setResult(await res.json());
      // The check is recorded on the connection, so reload to show it (and the account id Threads fills in).
      const list = await portalFetch('/portal/integrations');
      if (list.ok) onSaved(await list.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const guide = GUIDES[c.provider];
  const status = !c.connected ? { label: 'Not connected', cls: 'is-muted' } : c.enabled ? { label: 'On', cls: 'is-paid' } : { label: 'Saved, switched off', cls: 'is-pending' };

  return (
    <div className="portal-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0 }}>{c.label}</h4>
        <span className={`portal-badge ${status.cls}`}>{status.label}</span>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--p-muted)' }}>{c.description}</p>
      {c.provider === 'WHATSAPP' && c.ownerNoticesVia === 'platform' ? (
        <div className="portal-alert is-warn" style={{ marginTop: 12 }}>Your daily report is sent from the platform’s WhatsApp number until you connect your own. Customers never get a message from that number.</div>
      ) : null}

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 14 }}>How to set this up</summary>
        <p style={{ margin: '8px 0 4px', fontSize: 13 }}>{guide.intro}</p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.5 }}>{guide.steps.map((s) => <li key={s} style={{ marginBottom: 4 }}>{s}</li>)}</ol>
      </details>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 14, marginTop: 16 }}>
        {c.fields.map((f) => {
          const isSecret = f.kind === 'secret';
          const value = isSecret ? draft.secrets[f.key] ?? '' : draft.config[f.key] ?? f.value ?? '';
          return (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {f.label}{f.required ? ' *' : ''}
                {isSecret && f.set ? <span className="portal-badge is-paid" style={{ marginLeft: 8, fontWeight: 400 }}>Set {f.hint}</span> : null}
              </span>
              <input
                type={isSecret ? 'password' : 'text'}
                autoComplete="off"
                value={value}
                onChange={(e) => setDraft((d) => isSecret ? { ...d, secrets: { ...d.secrets, [f.key]: e.target.value } } : { ...d, config: { ...d.config, [f.key]: e.target.value } })}
                placeholder={isSecret ? (f.set ? 'Paste a new value to replace it' : f.placeholder ?? '') : f.placeholder ?? f.default ?? ''}
              />
              <span style={{ fontSize: 12, color: 'var(--p-muted)' }}>{f.help}</span>
            </label>
          );
        })}
      </div>

      <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 16 }}>
        <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} style={{ width: 'auto' }} />
        Switched on
      </label>
      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--p-muted)' }}>Nothing is sent or posted from this connection until you switch it on.</p>

      {error ? <div className="portal-alert is-error" style={{ marginTop: 12 }}>{error}</div> : null}
      {notice ? <div className="portal-alert is-success" style={{ marginTop: 12 }}>{notice}</div> : null}
      {result ? (
        <div className={`portal-alert ${result.ok ? 'is-success' : 'is-error'}`} style={{ marginTop: 12 }}>
          {result.message}
          {result.ok && result.details ? <span style={{ display: 'block', fontSize: 12, marginTop: 4 }}>{Object.entries(result.details).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</span> : null}
        </div>
      ) : null}
      {!result && c.lastCheckedAt ? (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: c.lastError ? 'var(--p-danger, #b42318)' : 'var(--p-muted)' }}>
          {c.lastError ? `Last check ${when(c.lastCheckedAt)} failed: ${c.lastError}` : `Last checked ${when(c.lastCheckedAt)}: working.`}
        </p>
      ) : null}
      {c.provider === 'THREADS' && c.tokenExpiresAt ? <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--p-muted)' }}>The login is good until {when(c.tokenExpiresAt)} and renews itself.</p> : null}

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button type="button" className="portal-btn" disabled={!changed || busy === 'save'} onClick={() => void save()}>{busy === 'save' ? 'Saving...' : 'Save'}</button>
        <button type="button" className="portal-btn-outline portal-btn" disabled={!c.connected || changed || busy === 'test'} onClick={() => void test()}>{busy === 'test' ? 'Checking...' : 'Test connection'}</button>
        {changed ? <button type="button" className="portal-btn-ghost" onClick={() => setDraft({ enabled: c.enabled, config: {}, secrets: {} })}>Undo changes</button> : null}
      </div>
      {c.connected && changed ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--p-muted)' }}>Save first, then test, so the check uses what you see.</p> : null}
    </div>
  );
}

export default function ConnectionsPage() {
  const { ready, isOwner } = useSession();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await portalFetch('/portal/integrations');
      if (!res.ok) throw new Error(await errorOf(res, 'Could not load your connections'));
      setListing(await res.json());
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { if (ready && isOwner) void load(); }, [ready, isOwner, load]);

  if (!ready) return <p>Loading...</p>;
  if (!isOwner) return <OwnerOnlyNotice what="see or change your connections" />;

  return (
    <div>
      <div className="portal-page-head"><h3>Connections</h3></div>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--p-muted)' }}>
        Connect your shop’s own WhatsApp number, Facebook Page and Threads account. Each uses a Meta app you create for your shop. Tokens and secrets are
        stored encrypted and are never shown again after you save them, only that they are set.
      </p>
      {error ? <div className="portal-alert is-error">{error}</div> : null}
      {listing && !listing.encryptionConfigured ? <div className="portal-alert is-warn" style={{ marginBottom: 16 }}>The server has no encryption key set, so secrets would be stored unencrypted. Ask the platform operator to set SECRETS_ENCRYPTION_KEY before you save any.</div> : null}
      {!listing && !error ? <p>Loading...</p> : null}
      {listing?.connections.map((c) => <ConnectionCard key={c.provider} c={c} onSaved={setListing} />)}
      <p style={{ fontSize: 13, color: 'var(--p-muted)' }}>
        Your daily report uses the WhatsApp connection above. Set who receives it under <Link href="/portal/daily-report">Daily report</Link>.
      </p>
    </div>
  );
}
