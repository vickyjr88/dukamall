"use client";

import { useState } from 'react';
import {
  combinations, newRowKey, optionLabel, SectionAxis, SizeRow, splitValues, suggestOptionSku,
} from './product-types';

/**
 * Defines the options a product comes in, for sections whose products are not simply sized: a phone (storage, colour,
 * condition), a shirt (size, colour), a watch (usually nothing, sometimes a strap). Each kind of option is a short list of
 * values; the combinations become the product's variants, each with its own SKU, price and stock.
 *
 * It is the same table as the size builder underneath (price once for all, SKUs generated from the name and options,
 * per-row overrides), so a merchant who knows one knows the other. Entering values for an option adds only the
 * combinations that are not there yet: nothing already priced or counted is ever overwritten.
 */
export function OptionsBuilder({
  rows, onRowsChange, productName, invalid, axes, noun,
}: {
  rows: SizeRow[];
  onRowsChange: (updater: (rows: SizeRow[]) => SizeRow[]) => void;
  productName: string;
  invalid: Set<string>;
  axes: SectionAxis[];
  noun: string;
}) {
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [basePrice, setBasePrice] = useState(() => rows.find((r) => r.priceKes)?.priceKes ?? '');
  const [baseWas, setBaseWas] = useState(() => rows.find((r) => r.wasPriceKes)?.wasPriceKes ?? '');

  const newRow = (attributes: Record<string, string>): SizeRow => ({
    key: newRowKey(),
    size: optionLabel(attributes),
    attributes,
    sku: suggestOptionSku(productName, attributes),
    skuTouched: false,
    priceKes: basePrice,
    priceTouched: false,
    wasPriceKes: baseWas,
    stockOnHand: '0',
    stockTouched: true,
    isActive: true,
  });

  const identity = (attributes: Record<string, string> | undefined) => JSON.stringify(Object.entries(attributes ?? {}).sort());

  function addCombinations(sets: Array<Record<string, string>>) {
    onRowsChange((current) => {
      const have = new Set(current.map((r) => identity(r.attributes)));
      const fresh: SizeRow[] = [];
      for (const attributes of sets) {
        if (have.has(identity(attributes))) continue;
        have.add(identity(attributes));
        fresh.push(newRow(attributes));
      }
      return [...current, ...fresh];
    });
  }

  function generate() {
    const picked = axes.map((a) => ({ key: a.key, values: splitValues(entries[a.key] ?? '') }));
    // Nothing typed: a product that comes one way, which is what most watches and accessories are.
    addCombinations(combinations(picked));
    setEntries({});
  }

  function update(key: string, patch: Partial<SizeRow>) {
    onRowsChange((current) => current.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      if (patch.attributes) next.size = optionLabel(next.attributes);
      if (patch.attributes && !next.skuTouched && !next.id) next.sku = suggestOptionSku(productName, next.attributes);
      return next;
    }));
  }

  function move(key: string, direction: -1 | 1) {
    onRowsChange((current) => {
      const i = current.findIndex((r) => r.key === key);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= current.length) return current;
      const next = current.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const typed = axes.some((a) => (entries[a.key] ?? '').trim());
  const optionKeys = axes.map((a) => a.key);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="portal-field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
          <label htmlFor="ob-base-price">Price for all (KES)</label>
          <input id="ob-base-price" type="number" min={0} step="0.01" value={basePrice} onChange={(e) => { setBasePrice(e.target.value); onRowsChange((c) => c.map((r) => (r.priceTouched ? r : { ...r, priceKes: e.target.value }))); }} placeholder="e.g. 21000" />
        </div>
        <div className="portal-field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
          <label htmlFor="ob-base-was">Compare-at price (optional)</label>
          <input id="ob-base-was" type="number" min={0} step="0.01" value={baseWas} onChange={(e) => { setBaseWas(e.target.value); onRowsChange((c) => c.map((r) => (r.priceTouched ? r : { ...r, wasPriceKes: e.target.value }))); }} placeholder="Shown struck through" />
        </div>
      </div>

      {axes.length ? (
        <div className="ob-axes">
          {axes.map((axis) => (
            <div key={axis.key} className="portal-field" style={{ marginBottom: 10 }}>
              <label htmlFor={`ob-${axis.key}`}>{axis.label}{axis.required ? ' (required)' : ' (optional)'}</label>
              <input
                id={`ob-${axis.key}`}
                value={entries[axis.key] ?? ''}
                onChange={(e) => setEntries((cur) => ({ ...cur, [axis.key]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); generate(); } }}
                placeholder={axis.presets.length ? `e.g. ${axis.presets.slice(0, 3).join(', ')}` : 'Separate with commas'}
                autoComplete="off"
              />
              {axis.presets.length ? (
                <div className="ob-presets">
                  {axis.presets.map((preset) => {
                    const current = splitValues(entries[axis.key] ?? '');
                    const on = current.some((c) => c.toLowerCase() === preset.toLowerCase());
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={`portal-btn-outline portal-btn portal-btn-sm${on ? ' is-on' : ''}`}
                        onClick={() => setEntries((cur) => {
                          const list = splitValues(cur[axis.key] ?? '');
                          const next = on ? list.filter((c) => c.toLowerCase() !== preset.toLowerCase()) : [...list, preset];
                          return { ...cur, [axis.key]: next.join(', ') };
                        })}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {axis.hint ? <span className="hint">{axis.hint}</span> : null}
            </div>
          ))}
          <button type="button" className="portal-btn" onClick={generate}>
            {typed ? 'Add these combinations' : `Add ${noun} with no options`}
          </button>
          <p className="hint" style={{ fontSize: 12, color: 'var(--p-muted)', margin: '8px 0 14px' }}>
            Every combination becomes its own line with its own SKU, price and stock, for example 128GB / Black / New. Adding more later keeps what you already priced.
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: 14 }}>
          {rows.length === 0 ? <button type="button" className="portal-btn" onClick={() => addCombinations([{}])}>Add {noun}</button> : null}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="portal-empty">Nothing added yet. {axes.length ? 'Choose the options above, or add it with no options.' : 'Add it to set the price and stock.'}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="portal-table pe-sizes">
            <thead>
              <tr>
                <th>{optionKeys.length ? 'Option' : 'Item'}</th><th>SKU</th><th>Price (KES)</th><th>Compare-at</th><th>Stock</th>
                <th title="Hidden lines stay in your records but don't show in the shop">Shown</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key} className={`${invalid.has(row.key) ? 'is-invalid' : ''}${row.isActive ? '' : ' is-hidden'}`}>
                  <td><strong style={{ whiteSpace: 'nowrap' }}>{optionLabel(row.attributes)}</strong></td>
                  <td><input value={row.sku} onChange={(e) => update(row.key, { sku: e.target.value, skuTouched: true })} aria-label="SKU" style={{ width: 210 }} /></td>
                  <td><input type="number" min={0} step="0.01" value={row.priceKes} onChange={(e) => update(row.key, { priceKes: e.target.value, priceTouched: true })} aria-label="Price" style={{ width: 100 }} /></td>
                  <td><input type="number" min={0} step="0.01" value={row.wasPriceKes} onChange={(e) => update(row.key, { wasPriceKes: e.target.value, priceTouched: true })} aria-label="Compare-at price" style={{ width: 100 }} /></td>
                  <td><input type="number" min={0} step="1" value={row.stockOnHand} onChange={(e) => update(row.key, { stockOnHand: e.target.value, stockTouched: true })} aria-label="Stock" style={{ width: 70 }} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={row.isActive} onChange={(e) => update(row.key, { isActive: e.target.checked })} aria-label="Shown in the shop" style={{ width: 'auto' }} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="portal-btn-ghost" onClick={() => move(row.key, -1)} disabled={index === 0} aria-label="Move up">&uarr;</button>
                    <button type="button" className="portal-btn-ghost" onClick={() => move(row.key, 1)} disabled={index === rows.length - 1} aria-label="Move down">&darr;</button>
                    <button type="button" className="portal-btn-ghost" onClick={() => onRowsChange((c) => c.filter((r) => r.key !== row.key))} aria-label="Remove">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.some((r) => r.id) ? (
        <p style={{ fontSize: 12, color: 'var(--p-muted)', marginTop: 8 }}>Removing a line that has orders keeps it in your records but hides it from the shop.</p>
      ) : null}
    </div>
  );
}
