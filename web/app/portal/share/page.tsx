"use client";

/**
 * Share: search the shop's products and open WhatsApp, Facebook, X or Telegram with the product, its price and a link already in place, or pick several
 * and send them as one catalogue message. A second tab makes a tagged link and a QR code for an ad, a bio or a poster on the shop door.
 * Nothing is posted for anyone: the networks give a website no way to do that, so this opens their own share screens and a person presses send.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { portalFetch } from '../portal-api';
import { Pager, SearchField, useListState, useSelection } from '../list-kit';
import { LinkBuilder } from './link-builder';

type Channel = { link: string; message: string; text: string; href: string | null };
type Item = {
  id: string; name: string; slug: string; brand: string | null; imageUrl: string | null; priceText: string; onOffer: boolean; isFeatured: boolean;
  channels: Record<'whatsapp' | 'facebook' | 'x' | 'telegram' | 'share' | 'link', Channel>;
};
type Stats = { days: number; total: number; people: number; byChannel: { channel: string; count: number }[]; topProducts: { slug: string; name: string; count: number }[]; visitsFromShares: number };

const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', facebook: 'Facebook', x: 'X', telegram: 'Telegram', share: 'Phone share', link: 'Copied link', download: 'Download' };

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const box = document.createElement('textarea');
    box.value = text; box.style.position = 'fixed'; box.style.opacity = '0';
    document.body.appendChild(box); box.select();
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  }
}

export default function SharePage() {
  const [tab, setTab] = useState<'products' | 'link'>('products');
  const { state, set, ready } = useListState({ product: '' }, { sort: 'newest', size: 12 });
  const [items, setItems] = useState<Item[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picked = useSelection();
  const names = useRef<Map<string, string>>(new Map());

  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'link') setTab('link'); }, []);

  // Coming from a product's Share button: search for that product.
  useEffect(() => { if (ready && state.product && !state.q) set({ q: state.product.replace(/-/g, ' '), product: '' }); }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(state.page), pageSize: String(state.size) });
    if (state.q) query.set('q', state.q);
    const res = await portalFetch(`/portal/share/search?${query.toString()}`);
    if (!res.ok) { setError('Could not load products'); return; }
    const data = await res.json();
    data.items.forEach((i: Item) => names.current.set(i.id, i.name));
    setItems(data.items); setTotal(data.total); setTotalPages(data.totalPages); setError(null);
  }, [state.page, state.size, state.q]);
  useEffect(() => { if (ready) void load(); }, [ready, load]);
  useEffect(() => { portalFetch('/portal/share/stats?days=7').then((r) => (r.ok ? r.json() : null)).then(setStats).catch(() => {}); }, []);

  function track(channel: string, kind: 'PRODUCT' | 'CATALOGUE', slug?: string, itemCount?: number) {
    void portalFetch('/portal/share/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, kind, productSlug: slug, itemCount }) }).catch(() => {});
  }
  const say = (text: string) => { setNotice(text); window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 3500); };

  async function share(item: Item, channel: keyof Item['channels']) {
    const c = item.channels[channel];
    if (channel === 'link') { say((await copy(c.link)) ? 'Link copied' : 'Could not copy. Select the address and copy it by hand.'); track('link', 'PRODUCT', item.slug); return; }
    if (channel === 'share') {
      if (navigator.share) {
        try { await navigator.share({ title: item.name, text: c.text, url: c.link }); track('share', 'PRODUCT', item.slug); } catch { /* closed the sheet: not a share */ }
      } else { say((await copy(c.message)) ? 'Message copied. This browser has no share sheet; paste it where you want it.' : 'Could not copy.'); }
      return;
    }
    if (c.href) { window.open(c.href, '_blank', 'noopener'); track(channel, 'PRODUCT', item.slug); }
  }

  async function sendCatalogue(how: 'whatsapp' | 'copy') {
    const res = await portalFetch('/portal/share/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(picked.ids) }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) { setError(data?.message || 'Could not make the message'); return; }
    if (how === 'whatsapp') { window.open(data.href, '_blank', 'noopener'); track('whatsapp', 'CATALOGUE', undefined, data.count); }
    else { say((await copy(data.message)) ? `Message for ${data.count} product${data.count === 1 ? '' : 's'} copied` : 'Could not copy'); track('link', 'CATALOGUE', undefined, data.count); }
    if (data.dropped > 0) say(`${data.dropped} left out (hidden or sold out since you picked them)`);
  }

  return (
    <div>
      <div className="portal-page-head">
        <h3>Share</h3>
        <p style={{ fontSize: 13, color: 'var(--p-muted)' }}>Send your products to WhatsApp chats and groups, Facebook, X and Telegram in two taps. Every link is tagged, so Analytics shows what each share brought in.</p>
      </div>

      {stats ? (
        <div className="kpi-grid" style={{ marginBottom: 14 }}>
          <div className="kpi"><div className="kpi-label">Shared in the last 7 days</div><div className="kpi-value">{stats.total}</div><div className="kpi-hint">{stats.byChannel.slice(0, 3).map((c) => `${CHANNEL_LABEL[c.channel] ?? c.channel} ${c.count}`).join(' · ') || 'Nothing yet'}</div></div>
          <div className="kpi"><div className="kpi-label">Visits from your shares</div><div className="kpi-value">{stats.visitsFromShares}</div><div className="kpi-hint">People who opened a link made here</div></div>
          <div className="kpi"><div className="kpi-label">Most shared</div><div className="kpi-value" style={{ fontSize: '1rem' }}>{stats.topProducts[0]?.name ?? '–'}</div><div className="kpi-hint">{stats.topProducts[0] ? `${stats.topProducts[0].count} times` : 'Share a product to start'}</div></div>
        </div>
      ) : null}

      <div className="portal-tabs">
        <button className={tab === 'products' ? 'is-active' : ''} onClick={() => setTab('products')}>Products</button>
        <button className={tab === 'link' ? 'is-active' : ''} onClick={() => setTab('link')}>Link &amp; QR code</button>
      </div>

      {notice ? <div className="portal-alert is-success" role="status">{notice}</div> : null}
      {error ? <div className="portal-alert is-error">{error}</div> : null}

      {tab === 'link' ? <LinkBuilder onTrack={(channel, kind) => void portalFetch('/portal/share/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, kind }) }).catch(() => {})} /> : (
        <>
          <div className="portal-card" style={{ marginBottom: 14 }}>
            <SearchField value={state.q} onChange={(q) => set({ q })} placeholder="Search your products by name, brand or SKU" label="Search products to share" />
            <p className="an-note">Only products that are shown in your shop and in stock appear here: a post about something sold out only disappoints.</p>
          </div>

          {picked.ids.size > 0 ? (
            <div className="lk-bulkbar" role="region" aria-label="Catalogue message">
              <strong>{picked.ids.size} picked</strong>
              <button type="button" className="portal-btn portal-btn-sm" style={{ background: '#25d366', borderColor: '#25d366' }} onClick={() => sendCatalogue('whatsapp')}>Send on WhatsApp</button>
              <button type="button" className="portal-btn portal-btn-sm portal-btn-outline" onClick={() => sendCatalogue('copy')}>Copy message</button>
              <span style={{ flex: 1 }} />
              <button type="button" className="portal-btn-ghost" style={{ color: '#fff' }} onClick={picked.clear}>Clear</button>
            </div>
          ) : items && items.length > 0 ? <p className="an-note" style={{ margin: '0 0 10px' }}>Tick several products to send them together as one message, ideal for a group.</p> : null}

          {!items ? <p>Loading...</p> : items.length === 0 ? (
            <div className="portal-card portal-empty">{state.q ? 'No shareable product matches that.' : 'Nothing to share yet: add products with stock first.'}</div>
          ) : (
            <div className="sh-grid">
              {items.map((item) => (
                <div key={item.id} className={`sh-card${picked.ids.has(item.id) ? ' is-picked' : ''}`}>
                  <label className="sh-pick" title="Add to a catalogue message"><input type="checkbox" checked={picked.ids.has(item.id)} onChange={() => picked.toggle(item.id)} aria-label={`Pick ${item.name}`} /></label>
                  {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" className="sh-img" /> : <div className="sh-img is-empty">No photo</div>}
                  <div className="sh-body">
                    <strong className="sh-name">{item.name}</strong>
                    <div className="sh-price">{item.priceText}{item.onOffer ? <span className="pl-tag is-offer">Offer</span> : null}</div>
                    <div className="sh-btns">
                      <button type="button" className="sh-btn is-wa" onClick={() => share(item, 'whatsapp')}>WhatsApp</button>
                      <button type="button" className="sh-btn" onClick={() => share(item, 'facebook')}>Facebook</button>
                      <button type="button" className="sh-btn" onClick={() => share(item, 'x')}>X</button>
                      <button type="button" className="sh-btn" onClick={() => share(item, 'telegram')}>Telegram</button>
                      <button type="button" className="sh-btn" onClick={() => share(item, 'share')} title="Instagram, TikTok, Messages and the rest, from your phone's share sheet">More&hellip;</button>
                      <button type="button" className="sh-btn" onClick={() => share(item, 'link')}>Copy link</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Pager page={state.page} pageSize={state.size} total={total} totalPages={totalPages} onPage={(page) => set({ page })} onSize={(size) => set({ size })} />
        </>
      )}
    </div>
  );
}
