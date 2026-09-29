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
  fontPairing: string;
  layoutPreset: string;
};

export default function ThemePage() {
  const [options, setOptions] = useState<ThemeOptions | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingHero, setUploadingHero] = useState(false);

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
      body: JSON.stringify({
        primaryColor: theme.primaryColor,
        accentColor: theme.accentColor,
        logoUrl: theme.logoUrl || undefined,
        // Explicit null, not `|| undefined` -- JSON.stringify drops an
        // undefined key entirely, and updateTheme's upsert only touches
        // keys actually present in the body. With `|| undefined` here,
        // clicking "Remove image" then Save silently kept the old URL in
        // the database (a real bug found while testing this feature): the
        // request just never mentioned heroImageUrl at all, so Prisma left
        // the column untouched. null is a real value that reaches the
        // column and clears it.
        heroImageUrl: theme.heroImageUrl || null,
        fontPairing: theme.fontPairing,
        layoutPreset: theme.layoutPreset,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data?.message || 'Could not save theme');
      return;
    }
    setSaved(true);
  }

  async function onUploadHeroImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !theme) return;
    setUploadingHero(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${PORTAL_API_BASE}/media/upload`, {
        method: 'POST', headers: authHeaders(), body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Upload failed');
      // Held in local state, not saved to the server yet -- Save theme below
      // is still the one action that commits it, same as every other field
      // on this form, so a merchant can preview then back out without
      // leaving the storefront mid-change.
      setTheme({ ...theme, heroImageUrl: data.url });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingHero(false);
      e.target.value = '';
    }
  }

  if (!options || !theme) return <p>Loading...</p>;

  return (
    <div>
      <div className="portal-page-head"><h3>Theme</h3></div>
      <div className="portal-card" style={{ maxWidth: 480 }}>
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
            <label>Logo URL (optional)</label>
            <input value={theme.logoUrl ?? ''} onChange={(e) => setTheme({ ...theme, logoUrl: e.target.value })} placeholder="https://..." />
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
            <input type="file" accept="image/*" onChange={onUploadHeroImage} disabled={uploadingHero} />
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
