"use client";

import { useEffect, useState } from 'react';
import { authHeaders, portalFetch, PORTAL_API_BASE } from '../portal-api';
import { ImagePicker } from '../media/image-picker';

type ThemeOptions = {
  fontPairings: { key: string; label: string }[];
  layoutPresets: { key: string; label: string }[];
  stylePresets: { key: string; label: string; description: string }[];
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
  stylePreset?: string;
};

/**
 * A small picture of each style for the picker: the page colour, the ink, and the accent. Only for display; the storefront's own definitions are in
 * app/lib/style-presets.ts. An unknown key (a style added to the API before this list) just shows no picture.
 */
const STYLE_SWATCHES: Record<string, { paper: string; ink: string; accent: string; line: string; luxe: boolean }> = {
  classic: { paper: '#ffffff', ink: '#17181c', accent: '#2438a8', line: '#e7e7ea', luxe: false },
  maison: { paper: '#f8f5ef', ink: '#17130e', accent: '#a1803f', line: '#e3dccf', luxe: true },
  noir: { paper: '#0e0d0b', ink: '#f2ede4', accent: '#c9a96e', line: '#2b2822', luxe: true },
};

function StyleCard({ preset, selected, onSelect }: { preset: { key: string; label: string; description: string }; selected: boolean; onSelect: () => void }) {
  const sw = STYLE_SWATCHES[preset.key];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        display: 'flex', gap: 14, alignItems: 'stretch', textAlign: 'left', width: '100%', padding: 12, cursor: 'pointer',
        background: 'var(--p-paper)', border: selected ? '2px solid var(--p-ink)' : '1px solid var(--p-line)', borderRadius: 'var(--p-radius-sm)',
      }}
    >
      {sw ? (
        <span aria-hidden="true" style={{ flex: '0 0 96px', height: 72, background: sw.paper, border: `1px solid ${sw.line}`, padding: 8, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span style={{ height: 3, width: '60%', background: sw.ink }} />
          <span style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
            <span style={{ width: 18, height: 26, background: sw.line }} />
            <span style={{ width: 18, height: 26, background: sw.line }} />
            <span style={{ height: 2, flex: 1, background: sw.accent }} />
          </span>
        </span>
      ) : null}
      <span style={{ minWidth: 0 }}>
        <strong style={{ display: 'block', marginBottom: 2 }}>{preset.label}</strong>
        <span className="hint" style={{ display: 'block', margin: 0 }}>{preset.description}</span>
      </span>
    </button>
  );
}

export default function ThemePage() {
  const [options, setOptions] = useState<ThemeOptions | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [pickerFor, setPickerFor] = useState<'logoUrl' | 'heroImageUrl' | null>(null);

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
        stylePreset: theme.stylePreset || 'classic',
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
          <fieldset style={{ border: 0, padding: 0, margin: '0 0 20px' }}>
            <legend style={{ fontWeight: 600, marginBottom: 8 }}>Style</legend>
            <div style={{ display: 'grid', gap: 10 }}>
              {options.stylePresets.map((preset) => (
                <StyleCard key={preset.key} preset={preset} selected={(theme.stylePreset || 'classic') === preset.key} onSelect={() => setTheme({ ...theme, stylePreset: preset.key })} />
              ))}
            </div>
            {STYLE_SWATCHES[theme.stylePreset || 'classic']?.luxe ? (
              <span className="hint" style={{ display: 'block', marginTop: 8 }}>
                The luxury styles set the page colours, type and layout for you. They pair best with the Cormorant or Bodoni font pairing below, and use your primary colour only for fine details
                (underlines and accents). Leave it on the default blue to use the style&apos;s own gold.
              </span>
            ) : null}
          </fieldset>

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
            <button type="button" className="portal-btn portal-btn-outline portal-btn-sm" style={{ marginTop: 6 }} onClick={() => setPickerFor('logoUrl')}>
              Choose from your photos
            </button>
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
            <button type="button" className="portal-btn portal-btn-outline portal-btn-sm" style={{ marginTop: 6 }} onClick={() => setPickerFor('heroImageUrl')}>
              Choose from your photos
            </button>
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

      <ImagePicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        alreadyAdded={[]}
        remainingSlots={1}
        title={pickerFor === 'logoUrl' ? 'Choose your logo' : 'Choose the hero image'}
        confirmLabel="Use this image"
        onAdd={(urls) => {
          // Held in local state like an upload: "Save theme" is still the one action that commits it.
          if (pickerFor && urls[0]) setTheme({ ...theme, [pickerFor]: urls[0] });
        }}
      />
    </div>
  );
}
