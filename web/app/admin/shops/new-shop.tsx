"use client";

/**
 * Set a shop up for a merchant who asked for one. The owner never gets a password from here: a new account is emailed a link to choose its own,
 * and an existing account (the same person's other shop) is simply given the new shop. Always recorded in the activity log.
 */
import { useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';

const SECTIONS: [string, string][] = [['footwear', 'Shoes'], ['clothes', 'Clothes'], ['watches', 'Watches'], ['electronics', 'Electronics'], ['devices', 'Devices and accessories']];
const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function NewShopForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ shopName: '', slug: '', ownerEmail: '', ownerFirstName: '', ownerLastName: '', billingPlan: 'TRIAL', trialDays: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [sections, setSections] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; name: string; message: string } | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const valid = form.shopName.trim() && /^[a-z0-9-]{3,40}$/.test(form.slug) && /\S+@\S+\.\S+/.test(form.ownerEmail) && form.ownerFirstName.trim() && form.ownerLastName.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body: Record<string, unknown> = { ...form, shopName: form.shopName.trim(), ownerEmail: form.ownerEmail.trim(), sections };
    if (form.billingPlan === 'TRIAL' && form.trialDays) body.trialDays = Number(form.trialDays); else delete body.trialDays;
    const res = await adminFetch('/admin/shops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) { setError(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Could not create the shop'); return; }
    setDone(data);
    onCreated();
  }

  if (done) {
    return (
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-alert is-success">{done.message}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/admin/shops/${done.id}`} className="admin-btn">Open {done.name}</Link>
          <button type="button" className="admin-btn-outline admin-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <form className="admin-card" style={{ marginBottom: 16 }} onSubmit={submit}>
      <h4>New shop</h4>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="admin-field" style={{ flex: '2 1 240px' }}>
          <label htmlFor="ns-name">Shop name</label>
          <input id="ns-name" required maxLength={80} value={form.shopName} onChange={(e) => set({ shopName: e.target.value, ...(slugEdited ? {} : { slug: slugify(e.target.value) }) })} />
        </div>
        <div className="admin-field" style={{ flex: '2 1 240px' }}>
          <label htmlFor="ns-slug">Web address</label>
          <input id="ns-slug" required value={form.slug} onChange={(e) => { setSlugEdited(true); set({ slug: slugify(e.target.value) }); }} />
          <span className="hint">{form.slug || 'name'}.&lt;platform domain&gt;. It goes into every link the shop shares, so it can&apos;t be changed later.</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="admin-field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="ns-first">Owner first name</label>
          <input id="ns-first" required maxLength={80} value={form.ownerFirstName} onChange={(e) => set({ ownerFirstName: e.target.value })} />
        </div>
        <div className="admin-field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="ns-last">Owner last name</label>
          <input id="ns-last" required maxLength={80} value={form.ownerLastName} onChange={(e) => set({ ownerLastName: e.target.value })} />
        </div>
        <div className="admin-field" style={{ flex: '2 1 240px' }}>
          <label htmlFor="ns-email">Owner email</label>
          <input id="ns-email" type="email" required value={form.ownerEmail} onChange={(e) => set({ ownerEmail: e.target.value })} />
          <span className="hint">A link to choose a password is emailed here. If this email already has an account, the shop is added to it.</span>
        </div>
      </div>
      <div className="admin-field">
        <label>What will it sell? <span className="hint">(creates starter categories)</span></label>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {SECTIONS.map(([key, label]) => (
            <label key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={sections.includes(key)} onChange={(e) => setSections((s) => e.target.checked ? [...s, key] : s.filter((x) => x !== key))} />{label}
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="admin-field" style={{ flex: '1 1 140px' }}>
          <label htmlFor="ns-plan">Plan</label>
          <select id="ns-plan" value={form.billingPlan} onChange={(e) => set({ billingPlan: e.target.value })}>
            <option value="TRIAL">Trial</option><option value="BASIC">Basic (active now)</option><option value="PRO">Pro (active now)</option>
          </select>
        </div>
        {form.billingPlan === 'TRIAL' ? (
          <div className="admin-field" style={{ flex: '1 1 140px' }}>
            <label htmlFor="ns-days">Trial days</label>
            <input id="ns-days" type="number" min={1} max={365} placeholder="Platform default" value={form.trialDays} onChange={(e) => set({ trialDays: e.target.value })} />
          </div>
        ) : null}
      </div>
      {error ? <div className="admin-alert is-error">{error}</div> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="admin-btn" disabled={busy || !valid}>{busy ? 'Creating...' : 'Create shop'}</button>
        <button type="button" className="admin-btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
