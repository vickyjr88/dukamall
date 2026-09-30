"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type Discount = {
  id: string; code: string; type: 'PERCENT' | 'FIXED_AMOUNT';
  percentOff: number | null; amountOffKes: string | null; minOrderKes: string | null;
  expiresAt: string | null; usageLimit: number | null; isActive: boolean;
  createdAt: string; _count: { redemptions: number };
};

const EMPTY_FORM = { code: '', type: 'PERCENT' as 'PERCENT' | 'FIXED_AMOUNT', percentOff: '10', amountOffKes: '', minOrderKes: '', expiresAt: '', usageLimit: '' };

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[] | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await portalFetch('/portal/discounts');
    if (res.ok) setDiscounts(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await portalFetch('/portal/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: form.code,
          type: form.type,
          percentOff: form.type === 'PERCENT' ? Number(form.percentOff) : undefined,
          amountOffKes: form.type === 'FIXED_AMOUNT' ? Number(form.amountOffKes) : undefined,
          minOrderKes: form.minOrderKes ? Number(form.minOrderKes) : undefined,
          expiresAt: form.expiresAt || undefined,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not create this discount');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(d: Discount) {
    await portalFetch(`/portal/discounts/${d.id}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !d.isActive }),
    });
    await load();
  }

  async function onDelete(d: Discount) {
    if (!window.confirm(`Delete code "${d.code}"? This can't be undone.`)) return;
    await portalFetch(`/portal/discounts/${d.id}`, { method: 'DELETE' });
    await load();
  }

  function describe(d: Discount): string {
    const value = d.type === 'PERCENT' ? `${d.percentOff}% off` : `KES ${Number(d.amountOffKes).toLocaleString()} off`;
    const min = d.minOrderKes ? ` (min. order KES ${Number(d.minOrderKes).toLocaleString()})` : '';
    return `${value}${min}`;
  }

  const isExpired = (d: Discount) => d.expiresAt && new Date(d.expiresAt) < new Date();

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Discounts</h3>
        <button className="portal-btn" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Cancel' : 'New code'}</button>
      </div>

      {showForm ? (
        <form onSubmit={onCreate} className="portal-card" style={{ marginBottom: 20, maxWidth: 560 }}>
          <h4 style={{ marginBottom: 16 }}>New discount code</h4>
          <div className="portal-field">
            <label>Code</label>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="WELCOME10" required />
          </div>
          <div className="portal-field">
            <label>Type</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as 'PERCENT' | 'FIXED_AMOUNT' }))}>
              <option value="PERCENT">Percentage off</option>
              <option value="FIXED_AMOUNT">Fixed amount off</option>
            </select>
          </div>
          {form.type === 'PERCENT' ? (
            <div className="portal-field">
              <label>Percent off</label>
              <input type="number" min={1} max={100} value={form.percentOff} onChange={(e) => setForm((f) => ({ ...f, percentOff: e.target.value }))} required />
            </div>
          ) : (
            <div className="portal-field">
              <label>Amount off (KES)</label>
              <input type="number" min={1} value={form.amountOffKes} onChange={(e) => setForm((f) => ({ ...f, amountOffKes: e.target.value }))} required />
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="portal-field" style={{ flex: 1 }}>
              <label>Minimum order (KES, optional)</label>
              <input type="number" min={1} value={form.minOrderKes} onChange={(e) => setForm((f) => ({ ...f, minOrderKes: e.target.value }))} />
            </div>
            <div className="portal-field" style={{ flex: 1 }}>
              <label>Usage limit (optional)</label>
              <input type="number" min={1} value={form.usageLimit} onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))} placeholder="Unlimited" />
            </div>
          </div>
          <div className="portal-field">
            <label>Expires (optional)</label>
            <input type="date" value={form.expiresAt} onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))} />
          </div>
          {error ? <div className="portal-alert is-error">{error}</div> : null}
          <button type="submit" className="portal-btn" disabled={busy}>{busy ? 'Creating...' : 'Create code'}</button>
        </form>
      ) : null}

      {!discounts ? <p>Loading...</p> : discounts.length === 0 ? (
        <div className="portal-empty">No discount codes yet -- create one above.</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="portal-table">
            <thead><tr><th>Code</th><th>Discount</th><th>Uses</th><th>Expires</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {discounts.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}>{d.code}</td>
                  <td>{describe(d)}</td>
                  <td>{d._count.redemptions}{d.usageLimit ? ` / ${d.usageLimit}` : ''}</td>
                  <td>{d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : <span style={{ color: 'var(--p-muted)' }}>Never</span>}</td>
                  <td>
                    {isExpired(d) ? (
                      <span className="portal-badge is-cancelled">Expired</span>
                    ) : (
                      <span className={`portal-badge ${d.isActive ? 'is-paid' : 'is-cancelled'}`}>{d.isActive ? 'Active' : 'Disabled'}</span>
                    )}
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => onToggleActive(d)}>
                      {d.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button className="portal-btn-ghost" onClick={() => onDelete(d)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
