"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type ThemeOptions = {
  fontPairings: { key: string; label: string }[];
  layoutPresets: { key: string; label: string }[];
};

type Theme = {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  fontPairing: string;
  layoutPreset: string;
};

export default function ThemePage() {
  const [options, setOptions] = useState<ThemeOptions | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
