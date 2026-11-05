"use client";

import { useCallback, useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { kes } from './format';

type Entry = { id: string; day: string; source: string; campaign: string | null; amountKes: number; note: string | null };

const PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'Google', 'X', 'YouTube'];
const today = () => new Date().toISOString().slice(0, 10);

/** Where the owner records what was spent on ads: one line per day and platform. Quick to fill, easy to undo. */
export function AdSpendCard({ from, to, onChanged }: { from: string; to: string; onChanged: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ day: today(), source: 'Facebook', amountKes: '', campaign: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    portalFetch(`/portal/analytics/ad-spend?${new URLSearchParams({ from, to }).toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntries)
      .catch(() => {});
  }, [from, to]);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await portalFetch('/portal/analytics/ad-spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: form.day, source: form.source, amountKes: Number(form.amountKes), campaign: form.campaign || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(Array.isArray(body?.message) ? body.message.join(' ') : body?.message || 'Could not save that.');
      }
      setForm((f) => ({ ...f, amountKes: '', campaign: '' }));
      load();
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await portalFetch(`/portal/analytics/ad-spend/${id}`, { method: 'DELETE' });
    load();
    onChanged();
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--p-line)', paddingTop: 12 }}>
      <button type="button" className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide ad spend' : `Enter ad spend${entries.length ? ` (${entries.length} in this period)` : ''}`}
      </button>
      {open ? (
        <div style={{ marginTop: 12 }}>
          <form onSubmit={add} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="ad-field">Day<input type="date" value={form.day} max={today()} onChange={(e) => setForm({ ...form, day: e.target.value })} required /></label>
            <label className="ad-field">Platform
              <input list="ad-platforms" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} required />
              <datalist id="ad-platforms">{PLATFORMS.map((p) => <option key={p} value={p} />)}</datalist>
            </label>
            <label className="ad-field">Spent (KES)<input type="number" min={1} step="0.01" value={form.amountKes} onChange={(e) => setForm({ ...form, amountKes: e.target.value })} required placeholder="e.g. 1500" /></label>
            <label className="ad-field">Campaign (optional)<input value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} maxLength={80} /></label>
            <button type="submit" className="portal-btn portal-btn-sm" disabled={saving}>{saving ? 'Saving...' : 'Add'}</button>
          </form>
          {error ? <div className="portal-alert is-error" style={{ marginTop: 10 }}>{error}</div> : null}
          {entries.length ? (
            <table className="portal-table" style={{ marginTop: 12 }}>
              <thead><tr><th>Day</th><th>Platform</th><th>Campaign</th><th>Spent</th><th></th></tr></thead>
              <tbody>
                {entries.map((en) => (
                  <tr key={en.id}>
                    <td>{en.day}</td><td>{en.source}</td><td>{en.campaign ?? ''}</td><td>{kes(en.amountKes)}</td>
                    <td><button type="button" className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => remove(en.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
