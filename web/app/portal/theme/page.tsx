"use client";

import { useEffect, useState } from 'react';
import { authHeaders, portalFetch, PORTAL_API_BASE } from '../portal-api';

type ThemeOptions = {
  fontPairings: { key: string; label: string }[];
  layoutPresets: { key: string; label: string }[];
};

type Theme = {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  heroImageUrl: string | null;
  heroEyebrow: string | null;
  heroHeadline: string | null;
  heroSubtitle: string | null;
  heroButtonLabel: string | null;
  fontPairing: string;
  layoutPreset: string;
};

export default function ThemePage() {
  const [options, setOptions] = useState<ThemeOptions | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    portalFetch('/portal/theme-options').then((r) => r.json()).then(setOptions);
    portalFetch('/portal/theme').then((r) => r.json()).then(setTheme);
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!theme) return;
    setError(null);
    setSaved(false);
    const res = await portalFetch('/portal/theme', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // null (not undefined) for every clearable field: JSON.stringify drops an
      // undefined key, so "Remove image" + Save would silently keep the old value.
      body: JSON.stringify({
        primaryColor: theme.primaryColor,
        accentColor: theme.accentColor,
        logoUrl: theme.logoUrl || null,
        heroImageUrl: theme.heroImageUrl || null,
        heroEyebrow: theme.heroEyebrow || null,
        heroHeadline: theme.heroHeadline || null,
        heroSubtitle: theme.heroSubtitle || null,
        heroButtonLabel: theme.heroButtonLabel || null,
        fontPairing: theme.fontPairing,
        layoutPreset: theme.layoutPreset,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Could not save theme');
      return;
    }
    setSaved(true);
  }

  // Held in local state, not saved to the server yet -- "Save theme" below is
  // still the one action that commits it, same as every other field on this
  // form, so a merchant can preview then back out without changing the live shop.
  async function upload(e: React.ChangeEvent<HTMLInputElement>, field: 'heroImageUrl' | 'logoUrl', setBusy: (v: boolean) => void) {
    const file = e.target.files?.[0];
    if (!file || !theme) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${PORTAL_API_BASE}/media/upload`, { method: 'POST', headers: authHeaders(), body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Upload failed');
      setTheme({ ...theme, [field]: data.url });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  if (!options || !theme) return <p>Loading...</p>;

  return (
    <div>
      <div className="portal-page-head"><h3>Theme</h3></div>
      <div className="portal-card" style={{ maxWidth: 560 }}>
        <p style={{ color: 'var(--p-muted)', marginBottom: 20 }}>
          Pick colors, a font pairing and a layout style. Changes apply to your storefront as soon as you save.
        </p>
        <form onSubmit={onSave}>
          <div className="portal-field">
            <label>Primary color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="color" value={theme.primaryColor} onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })} />
              <input value={theme.primaryColor} onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })} style={{ width: 110 }} />
            </div>
          </div>

          <div className="portal-field">
            <label>Accent color</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="color" value={theme.accentColor} onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })} />
              <input value={theme.accentColor} onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })} style={{ width: 110 }} />
            </div>
          </div>

          <div className="portal-field">
            <label>Logo (optional)</label>
            {theme.logoUrl ? (
              <div style={{ marginBottom: 10, padding: 12, background: 'var(--p-paper)', border: '1px solid var(--p-line)', borderRadius: 'var(--p-radius-sm)', display: 'inline-block' }}>
                <img src={theme.logoUrl} alt="Logo preview" style={{ display: 'block', maxHeight: 48, maxWidth: 220 }} />
              </div>
            ) : null}
            <input type="file" accept="image/*" onChange={(e) => upload(e, 'logoUrl', setUploadingLogo)} disabled={uploadingLogo} />
            {uploadingLogo ? <span className="hint">Uploading...</span> : null}
            {theme.logoUrl ? (
              <button type="button" className="portal-btn-ghost" style={{ marginTop: 6 }} onClick={() => setTheme({ ...theme, logoUrl: null })}>
                Remove logo
              </button>
            ) : null}
            <span className="hint">Replaces your shop name in the header. A wide image on a transparent background works best.</span>
          </div>

          <div className="portal-field">
            <label>Home page hero background image (optional)</label>
            {theme.heroImageUrl ? (
              <div style={{ marginBottom: 10 }}>
                <img
                  src={theme.heroImageUrl}
                  alt="Hero preview"
                  style={{ width: '100%', maxWidth: 320, height: 140, objectFit: 'cover', borderRadius: 'var(--p-radius-sm)', border: '1px solid var(--p-line)' }}
                />
              </div>
            ) : null}
            <input type="file" accept="image/*" onChange={(e) => upload(e, 'heroImageUrl', setUploadingHero)} disabled={uploadingHero} />
            {uploadingHero ? <span className="hint">Uploading...</span> : null}
            {theme.heroImageUrl ? (
              <button
                type="button"
                className="portal-btn-ghost"
                style={{ marginTop: 6 }}
                onClick={() => setTheme({ ...theme, heroImageUrl: null })}
              >
                Remove image
              </button>
            ) : null}
            <span className="hint">Shown behind your shop name on the home page. Landscape photos work best -- at least 1600px wide.</span>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>Home page banner text</legend>
            <div className="portal-field">
              <label htmlFor="hero-eyebrow">Small label above the headline</label>
              <input id="hero-eyebrow" value={theme.heroEyebrow ?? ''} maxLength={40} placeholder="New arrivals" onChange={(e) => setTheme({ ...theme, heroEyebrow: e.target.value })} />
            </div>
            <div className="portal-field">
              <label htmlFor="hero-headline">Headline</label>
              <input id="hero-headline" value={theme.heroHeadline ?? ''} maxLength={80} placeholder="Your shop name" onChange={(e) => setTheme({ ...theme, heroHeadline: e.target.value })} />
            </div>
            <div className="portal-field">
              <label htmlFor="hero-subtitle">Sentence under it</label>
              <textarea id="hero-subtitle" rows={2} value={theme.heroSubtitle ?? ''} maxLength={200} placeholder="Shop the latest drop -- new pieces added regularly, while stock lasts." onChange={(e) => setTheme({ ...theme, heroSubtitle: e.target.value })} />
            </div>
            <div className="portal-field">
              <label htmlFor="hero-button">Button text</label>
              <input id="hero-button" value={theme.heroButtonLabel ?? ''} maxLength={30} placeholder="Shop now" onChange={(e) => setTheme({ ...theme, heroButtonLabel: e.target.value })} />
              <span className="hint">Leave any of these empty to keep the default wording shown in grey.</span>
            </div>
          </fieldset>

          <div className="portal-field">
            <label>Font pairing</label>
            <select value={theme.fontPairing} onChange={(e) => setTheme({ ...theme, fontPairing: e.target.value })}>
              {options.fontPairings.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>

          <div className="portal-field">
            <label>Layout style</label>
            <select value={theme.layoutPreset} onChange={(e) => setTheme({ ...theme, layoutPreset: e.target.value })}>
              {options.layoutPresets.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
          </div>

          {saved ? <div className="portal-alert is-success">Saved. Visit your storefront to see it live.</div> : null}
          {error ? <div className="portal-alert is-error">{error}</div> : null}
          <button type="submit" className="portal-btn">Save theme</button>
        </form>
      </div>
    </div>
  );
}
