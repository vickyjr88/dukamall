"use client";

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

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

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('shops_platform_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ThemePage() {
  const [options, setOptions] = useState<ThemeOptions | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/portal/theme-options`).then((r) => r.json()).then(setOptions);
    fetch(`${API_BASE}/portal/theme`, { headers: authHeaders() }).then((r) => r.json()).then(setTheme);
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!theme) return;
    setError(null);
    setSaved(false);
    const res = await fetch(`${API_BASE}/portal/theme`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
    <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0 }}>Theme your shop</h3>
      <p style={{ fontSize: 13, color: '#666', marginTop: -8 }}>
        Pick colors, a font pairing and a layout style. Changes apply to your storefront as soon as you save.
      </p>

      <label>
        Primary color
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={theme.primaryColor} onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })} />
          <input value={theme.primaryColor} onChange={(e) => setTheme({ ...theme, primaryColor: e.target.value })} style={{ width: 90 }} />
        </div>
      </label>

      <label>
        Accent color
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={theme.accentColor} onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })} />
          <input value={theme.accentColor} onChange={(e) => setTheme({ ...theme, accentColor: e.target.value })} style={{ width: 90 }} />
        </div>
      </label>

      <label>
        Logo URL (optional)
        <input value={theme.logoUrl ?? ''} onChange={(e) => setTheme({ ...theme, logoUrl: e.target.value })} placeholder="https://..." />
      </label>

      <label>
        Font pairing
        <select value={theme.fontPairing} onChange={(e) => setTheme({ ...theme, fontPairing: e.target.value })}>
          {options.fontPairings.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </label>

      <label>
        Layout style
        <select value={theme.layoutPreset} onChange={(e) => setTheme({ ...theme, layoutPreset: e.target.value })}>
          {options.layoutPresets.map((l) => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </select>
      </label>

      <button type="submit">Save theme</button>
      {saved ? <p style={{ color: 'green' }}>Saved. Visit your storefront to see it live.</p> : null}
      {error ? <p style={{ color: 'red' }}>{error}</p> : null}
    </form>
  );
}
