"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type Content = {
  name: string; tagline: string | null; announcement: string | null; seoDescription: string | null;
  contactEmail: string | null; contactPhone: string | null; address: string | null; openingHours: string | null;
  instagramUrl: string | null; facebookUrl: string | null; tiktokUrl: string | null;
};

const SEO_TARGET = 160;

// The words and links around the catalogue: shop name, footer blurb, the slim
// announcement bar, contact details, social links, and how the home page
// reads in Google and in WhatsApp link previews.
export default function StoreInfoPage() {
  const [content, setContent] = useState<Content | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalFetch('/portal/storefront').then((r) => r.json()).then(setContent);
  }, []);

  if (!content) return <p>Loading...</p>;

  const set = (patch: Partial<Content>) => { setContent({ ...content, ...patch }); setSaved(false); };
  const text = (key: keyof Content) => (content[key] as string | null) ?? '';

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!content) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    // "" clears a field server-side (undefined would leave the old value in place).
    const res = await portalFetch('/portal/storefront', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(Object.entries(content).map(([k, v]) => [k, (v ?? '').toString().trim()]))),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Could not save');
      return;
    }
    setContent(await res.json());
    setSaved(true);
  }

  const seoLength = text('seoDescription').length;

  return (
    <div>
      <div className="portal-page-head"><h3>Store info</h3></div>
      <form onSubmit={onSave} style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="portal-card">
          <h4>Your shop</h4>
          <div className="portal-field">
            <label htmlFor="si-name">Shop name</label>
            <input id="si-name" required maxLength={80} value={content.name} onChange={(e) => set({ name: e.target.value })} />
            <span className="hint">Shown in the header, the footer, emails and link previews. Your web address doesn&apos;t change.</span>
          </div>
          <div className="portal-field">
            <label htmlFor="si-announcement">Announcement bar (optional)</label>
            <input id="si-announcement" maxLength={160} value={text('announcement')} placeholder="Free delivery on orders over KES 5,000" onChange={(e) => set({ announcement: e.target.value })} />
            <span className="hint">A slim line across the top of every page. Clear it to hide the bar.</span>
          </div>
          <div className="portal-field">
            <label htmlFor="si-tagline">Footer blurb (optional)</label>
            <textarea id="si-tagline" rows={2} maxLength={200} value={text('tagline')} placeholder="Authentic sneakers, delivered countrywide." onChange={(e) => set({ tagline: e.target.value })} />
          </div>
        </div>

        <div className="portal-card">
          <h4>Contact details</h4>
          <p className="hint" style={{ marginTop: 0 }}>Shown in your footer. Leave anything blank to leave it out.</p>
          <div className="portal-field">
            <label htmlFor="si-phone">Phone</label>
            <input id="si-phone" maxLength={40} value={text('contactPhone')} placeholder="+254 712 345 678" onChange={(e) => set({ contactPhone: e.target.value })} />
          </div>
          <div className="portal-field">
            <label htmlFor="si-email">Email</label>
            <input id="si-email" type="email" maxLength={120} value={text('contactEmail')} placeholder="hello@yourshop.co.ke" onChange={(e) => set({ contactEmail: e.target.value })} />
          </div>
          <div className="portal-field">
            <label htmlFor="si-address">Address</label>
            <input id="si-address" maxLength={200} value={text('address')} placeholder="Shop F53, Dubai Merchants Mall, Nairobi CBD" onChange={(e) => set({ address: e.target.value })} />
          </div>
          <div className="portal-field">
            <label htmlFor="si-hours">Opening hours</label>
            <input id="si-hours" maxLength={200} value={text('openingHours')} placeholder="Mon-Sat 9am-6pm" onChange={(e) => set({ openingHours: e.target.value })} />
          </div>
        </div>

        <div className="portal-card">
          <h4>Social links</h4>
          <div className="portal-field">
            <label htmlFor="si-ig">Instagram</label>
            <input id="si-ig" type="url" maxLength={300} value={text('instagramUrl')} placeholder="https://instagram.com/yourshop" onChange={(e) => set({ instagramUrl: e.target.value })} />
          </div>
          <div className="portal-field">
            <label htmlFor="si-fb">Facebook</label>
            <input id="si-fb" type="url" maxLength={300} value={text('facebookUrl')} placeholder="https://facebook.com/yourshop" onChange={(e) => set({ facebookUrl: e.target.value })} />
          </div>
          <div className="portal-field">
            <label htmlFor="si-tt">TikTok</label>
            <input id="si-tt" type="url" maxLength={300} value={text('tiktokUrl')} placeholder="https://tiktok.com/@yourshop" onChange={(e) => set({ tiktokUrl: e.target.value })} />
          </div>
        </div>

        <div className="portal-card">
          <h4>Search &amp; sharing</h4>
          <div className="portal-field">
            <label htmlFor="si-seo">Home page description</label>
            <textarea id="si-seo" rows={3} maxLength={300} value={text('seoDescription')} placeholder={`What ${content.name || 'your shop'} sells and why people should visit.`} onChange={(e) => set({ seoDescription: e.target.value })} />
            <span className="hint">
              The line under your shop name in Google and in WhatsApp previews. {seoLength}/{SEO_TARGET} characters
              {seoLength > SEO_TARGET ? ' -- search engines may cut the end off.' : ' is a good length.'}
            </span>
          </div>
          <div style={{ border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-sm)', padding: 12, background: 'var(--p-paper)' }}>
            <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>How it may look in search</div>
            <div style={{ color: 'var(--p-primary)', fontSize: 17, marginTop: 2 }}>{content.name || 'Your shop'}</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{text('seoDescription') || `Shop ${content.name || 'your shop'} -- new arrivals added regularly.`}</div>
          </div>
        </div>

        {saved ? <div className="portal-alert is-success">Saved. Visit your storefront to see it live.</div> : null}
        {error ? <div className="portal-alert is-error">{error}</div> : null}
        <div><button type="submit" className="portal-btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></div>
      </form>
    </div>
  );
}
