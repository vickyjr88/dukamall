"use client";

/**
 * A tagged address for the shop, one product or any page, plus a QR code of it: for an ad, a bio, a flyer, or a poster on the shop door.
 * The address is made on the server (the same rules as every other share link), the QR code in the browser.
 */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { portalFetch } from '../portal-api';

const SOURCES: { value: string; label: string; medium: string }[] = [
  { value: 'instagram', label: 'Instagram bio or story', medium: 'social' },
  { value: 'facebook', label: 'Facebook post or ad', medium: 'social' },
  { value: 'tiktok', label: 'TikTok', medium: 'social' },
  { value: 'whatsapp', label: 'WhatsApp', medium: 'social' },
  { value: 'poster', label: 'Poster or flyer (QR)', medium: 'print' },
  { value: 'business-card', label: 'Business card', medium: 'print' },
  { value: 'other', label: 'Somewhere else', medium: 'link' },
];

type Hit = { slug: string; name: string };

export function LinkBuilder({ onTrack }: { onTrack: (channel: string, kind: 'LINK' | 'QR') => void }) {
  const [target, setTarget] = useState<'shop' | 'product' | 'path'>('shop');
  const [source, setSource] = useState('poster');
  const [campaign, setCampaign] = useState('');
  const [path, setPath] = useState('/');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [product, setProduct] = useState<Hit | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => { portalFetch('/portal/share/context').then((r) => r.json()).then((c) => setShopName(c.shopName)).catch(() => {}); }, []);

  useEffect(() => {
    if (target !== 'product' || query.trim().length < 2) { setHits([]); return; }
    const timer = window.setTimeout(() => {
      portalFetch(`/portal/share/search?q=${encodeURIComponent(query.trim())}&pageSize=5`).then((r) => r.json()).then((d) => setHits((d.items ?? []).map((i: any) => ({ slug: i.slug, name: i.name })))).catch(() => {});
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, target]);

  // Rebuild the address whenever a choice changes.
  useEffect(() => {
    if (target === 'product' && !product) { setUrl(null); return; }
    const q = new URLSearchParams({ target, source, medium: SOURCES.find((s) => s.value === source)?.medium ?? 'link' });
    if (campaign.trim()) q.set('campaign', campaign.trim());
    if (target === 'product' && product) q.set('slug', product.slug);
    if (target === 'path') q.set('path', path);
    let live = true;
    portalFetch(`/portal/share/link?${q.toString()}`).then(async (r) => {
      const d = await r.json().catch(() => null);
      if (!live) return;
      if (r.ok) { setUrl(d.url); setError(null); } else { setUrl(null); setError(d?.message || 'Could not make the link'); }
    }).catch(() => {});
    return () => { live = false; };
  }, [target, source, campaign, path, product]);

  useEffect(() => { if (url && canvas.current) void QRCode.toCanvas(canvas.current, url, { width: 220, margin: 1, errorCorrectionLevel: 'M' }); }, [url]);

  async function copy() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 2500); onTrack('link', 'LINK'); } catch { setError('Could not copy. Select the address and copy it by hand.'); }
  }
  function download() {
    if (!url) return;
    void QRCode.toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: 'M' }).then((data) => {
      const a = document.createElement('a'); a.href = data; a.download = 'shop-qr.png'; document.body.appendChild(a); a.click(); a.remove();
      onTrack('download', 'QR');
    });
  }

  return (
    <div className="portal-card lb-layout">
      <div>
        <h4>Make a tagged link</h4>
        <div className="portal-field">
          <label>Where should it open?</label>
          <select value={target} onChange={(e) => { setTarget(e.target.value as typeof target); setProduct(null); }}>
            <option value="shop">My shop&apos;s home page</option><option value="product">One product</option><option value="path">Another page of my shop</option>
          </select>
        </div>
        {target === 'product' ? (
          <div className="portal-field">
            <label>Product</label>
            {product ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><strong style={{ flex: 1 }}>{product.name}</strong><button type="button" className="portal-btn-ghost" onClick={() => { setProduct(null); setQuery(''); }}>Change</button></div>
            ) : (
              <>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type the product's name" />
                {hits.length > 0 ? <ul className="lb-hits">{hits.map((h) => <li key={h.slug}><button type="button" onClick={() => setProduct(h)}>{h.name}</button></li>)}</ul> : null}
              </>
            )}
          </div>
        ) : null}
        {target === 'path' ? (
          <div className="portal-field"><label>Page address</label><input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/pages/about" /><span className="hint">Starts with a slash, like /pages/delivery</span></div>
        ) : null}
        <div className="portal-field">
          <label>Where will you put it?</label>
          <select value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        </div>
        <div className="portal-field">
          <label>Name this campaign <span className="hint">(optional)</span></label>
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="e.g. black friday" maxLength={60} />
          <span className="hint">Analytics &rarr; Visits &amp; ads lists visits by this name, so you can see which one worked.</span>
        </div>
        {error ? <div className="portal-alert is-error">{error}</div> : null}
        {url ? (
          <div className="portal-field">
            <label>Your link</label>
            <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <button type="button" className="portal-btn portal-btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
              <a className="portal-btn portal-btn-sm portal-btn-outline" href={url} target="_blank" rel="noopener noreferrer">Open it</a>
            </div>
          </div>
        ) : null}
      </div>

      <div className="lb-qr">
        <h4>QR code</h4>
        {url ? (
          <>
            <div className="lb-poster" id="qr-poster">
              <div className="lb-poster-name">{shopName}</div>
              <canvas ref={canvas} aria-label="QR code for the link" />
              <div className="lb-poster-cta">Scan to shop</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" className="portal-btn portal-btn-sm" onClick={download}>Download picture</button>
              <button type="button" className="portal-btn portal-btn-sm portal-btn-outline" onClick={() => { onTrack('download', 'QR'); window.print(); }}>Print poster</button>
            </div>
            <p className="an-note">Print it for the shop door, the till, parcels and business cards. Choose &ldquo;Poster or flyer&rdquo; above so those visits are counted separately.</p>
          </>
        ) : <p className="an-note">Pick where the link should open and the QR code appears here.</p>}
      </div>
    </div>
  );
}
