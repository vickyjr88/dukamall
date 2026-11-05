"use client";

import { Spec } from './product-types';

/**
 * The facts a shopper compares, as a two-column table on the product page: Battery, Display, Warranty. The section suggests
 * the usual labels (one click adds a row); staff can add any other. Rows left blank are dropped when the product is saved.
 */
export function SpecsEditor({ specs, onChange, suggestions }: { specs: Spec[]; onChange: (next: Spec[]) => void; suggestions: string[] }) {
  const used = new Set(specs.map((s) => s.label.trim().toLowerCase()));
  const update = (i: number, patch: Partial<Spec>) => onChange(specs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div>
      {suggestions.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>Add</span>
          {suggestions.filter((label) => !used.has(label.toLowerCase())).map((label) => (
            <button key={label} type="button" className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => onChange([...specs, { label, value: '' }])}>{label}</button>
          ))}
        </div>
      ) : null}
      {specs.length === 0 ? (
        <div className="portal-empty" style={{ padding: 16 }}>No specifications yet. Add the ones shoppers ask about.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {specs.map((spec, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input aria-label="Specification name" value={spec.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="e.g. Battery" maxLength={40} style={{ flex: '0 0 170px' }} />
              <input aria-label="Specification value" value={spec.value} onChange={(e) => update(i, { value: e.target.value })} placeholder="e.g. 5000 mAh" maxLength={200} style={{ flex: 1 }} />
              <button type="button" className="portal-btn-ghost" onClick={() => onChange(specs.filter((_, idx) => idx !== i))} aria-label="Remove specification">&times;</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="portal-btn-outline portal-btn portal-btn-sm" style={{ marginTop: 10 }} onClick={() => onChange([...specs, { label: '', value: '' }])}>Add a specification</button>
    </div>
  );
}
