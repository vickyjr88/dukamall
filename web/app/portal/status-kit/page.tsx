"use client";

/**
 * WhatsApp Status kit. WhatsApp has no way to post a Status automatically, so each day the server prepares a few ready pictures (the product, its price,
 * what is in stock, how to order) in the shop's own colours, and the text that goes with them. Made for a phone: Share opens the phone's share sheet, where
 * WhatsApp > My status takes the picture and the text in one go. "Mark as posted" moves that product to the back of the line.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { portalFetch } from '../portal-api';
import { useSession } from '../portal-session';

type Item = { id: string; status: string; productName: string | null; productSlug: string | null; postedAt: string | null; available: boolean; caption: string | null };
type Kit = { count: number; items: Item[] };
type Picture = { url: string; blob: Blob } | 'failed';

const muted = { color: 'var(--p-muted)' } as const;
// A swapped item keeps its id but is a different product, so its picture is remembered by both.
const picKey = (item: Item) => `${item.id}:${item.productSlug ?? ''}`;
const fileName = (item: Item) => `status-${(item.productSlug || item.id).slice(0, 40)}.jpg`;
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null);
  const message = data?.message;
  return Array.isArray(message) ? message.join(' ') : message || fallback;
}

export default function StatusKitPage() {
  const { ready, isOwner } = useSession();
  const [kit, setKit] = useState<Kit | null>(null);
  const [pictures, setPictures] = useState<Record<string, Picture>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requested = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await portalFetch('/portal/status-kit');
      if (!res.ok) throw new Error(await errorOf(res, 'Could not prepare the pictures'));
      setKit(await res.json());
    } catch (e: any) { setError(e.message); }
  }, []);

  useEffect(() => { if (ready) void load(); }, [ready, load]);

  // The pictures need the login to fetch, so they are fetched here and shown from memory.
  useEffect(() => {
    if (!kit) return;
    for (const item of kit.items) {
      const key = picKey(item);
      if (!item.available || requested.current.has(key)) continue;
      requested.current.add(key);
      void portalFetch(`/portal/status-kit/${item.id}/image`)
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.blob();
          setPictures((prev) => ({ ...prev, [key]: { url: URL.createObjectURL(blob), blob } }));
        })
        .catch(() => setPictures((prev) => ({ ...prev, [key]: 'failed' })));
    }
  }, [kit]);

  if (!ready) return <p>Loading...</p>;

  const picture = (item: Item) => { const p = pictures[picKey(item)]; return p && p !== 'failed' ? p : null; };

  async function share(item: Item) {
    const pic = picture(item);
    if (!pic) return;
    const file = new File([pic.blob], fileName(item), { type: 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: item.caption || undefined });
      } else {
        download(item);
        setNotice('This browser cannot share pictures straight to WhatsApp, so it was downloaded. Open WhatsApp > Status and add it from your gallery.');
      }
    } catch (e: any) {
      // The person closed the share sheet: nothing went wrong.
      if (e?.name !== 'AbortError') setError(e?.message || 'Could not share');
    }
  }

  function download(item: Item) {
    const pic = picture(item);
    if (!pic) return;
    const a = document.createElement('a');
    a.href = pic.url;
    a.download = fileName(item);
    a.click();
  }

  async function copy(item: Item) {
    try { await navigator.clipboard.writeText(item.caption || ''); setNotice('Text copied.'); setError(null); }
    catch { setError('Could not copy. Press and hold the text to copy it.'); }
  }

  async function act(item: Item, action: 'swap' | 'posted') {
    setBusy(`${action}-${item.id}`); setError(null); setNotice(null);
    try {
      const res = await portalFetch(`/portal/status-kit/${item.id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not do that'));
      setKit(await res.json());
      setNotice(action === 'posted' ? 'Marked as posted. It will not be offered again soon.' : 'Swapped for the next product.');
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  async function setCount(count: number) {
    setBusy('count'); setError(null); setNotice(null);
    try {
      const res = await portalFetch('/portal/status-kit/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count }) });
      if (!res.ok) throw new Error(await errorOf(res, 'Could not save'));
      await load();
      setNotice(`From now on ${count} picture${count === 1 ? '' : 's'} a day. Today's pictures are kept as they are; more are added if you asked for more.`);
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  return (
    <div>
      <div className="portal-page-head"><h3>WhatsApp Status</h3></div>
      {error ? <div className="portal-alert is-error">{error}</div> : null}
      {notice ? <div className="portal-alert is-success">{notice}</div> : null}

      <div className="portal-card" style={{ marginBottom: 20 }}>
        <h4 style={{ marginTop: 0 }}>How to post</h4>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>Open this page on the phone that has the shop&apos;s WhatsApp.</li>
          <li>Tap <strong>Share to WhatsApp</strong> under a picture, then choose <strong>My status</strong>. The text comes with it; you can edit it.</li>
          <li>Tap <strong>Mark as posted</strong> so that product is not offered again soon.</li>
        </ol>
        <p style={{ margin: '10px 0 0', fontSize: 13, ...muted }}>
          WhatsApp does not let any system post a Status for you, so this is as automatic as it gets: each day the products, the pictures (in your shop&apos;s colours) and the text are
          chosen and made. People who reply to a Status land in the shop&apos;s chat. Nothing is posted or sent from here.
        </p>
        {isOwner && kit ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 14 }}>
            Pictures a day
            <select value={kit.count} disabled={busy === 'count'} onChange={(e) => void setCount(Number(e.target.value))} style={{ width: 'auto' }}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {!kit ? <p>Preparing today&apos;s pictures...</p> : kit.items.length === 0 ? (
        <div className="portal-card"><p style={{ margin: 0, ...muted }}>No product is ready: none is in stock with a photo.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 16 }}>
          {kit.items.map((item) => {
            const pic = pictures[picKey(item)];
            const posted = item.status === 'POSTED';
            return (
              <div key={item.id} className="portal-card" style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{item.productName ?? 'Product'}</strong>
                  <span className={`portal-badge ${posted ? 'is-paid' : 'is-muted'}`}>{posted ? 'Posted' : 'To post'}</span>
                </div>
                {!item.available ? (
                  <p className="portal-alert is-error" style={{ margin: '8px 0' }}>This product is no longer in stock with a photo. Swap it for another.</p>
                ) : pic && pic !== 'failed' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pic.url} alt={item.productName ?? 'Status picture'} style={{ width: '100%', maxWidth: 360, height: 'auto', borderRadius: 10, margin: '12px 0', display: 'block' }} />
                ) : pic === 'failed' ? (
                  <p className="portal-alert is-error" style={{ margin: '8px 0' }}>The picture could not be made. Try again, or swap the product.</p>
                ) : (
                  <div style={{ width: '100%', maxWidth: 360, aspectRatio: '9 / 16', borderRadius: 10, margin: '12px 0', display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.04)', ...muted }}>Making the picture...</div>
                )}
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit', margin: '0 0 12px', padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.04)', fontSize: 13 }}>{item.caption}</pre>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" className="portal-btn" disabled={!picture(item)} onClick={() => void share(item)}>Share to WhatsApp</button>
                  <button type="button" className="portal-btn-outline portal-btn" disabled={!picture(item)} onClick={() => download(item)}>Download</button>
                  <button type="button" className="portal-btn-outline portal-btn" onClick={() => void copy(item)}>Copy text</button>
                </div>
                {!posted ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    <button type="button" className="portal-btn-outline portal-btn" disabled={busy === `posted-${item.id}`} onClick={() => void act(item, 'posted')}>Mark as posted</button>
                    <button type="button" className="portal-btn-outline portal-btn" disabled={busy === `swap-${item.id}`} onClick={() => void act(item, 'swap')}>Swap product</button>
                  </div>
                ) : null}
                {posted && item.postedAt ? <p style={{ margin: '8px 0 0', fontSize: 13, ...muted }}>Posted {when(item.postedAt)}</p> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
