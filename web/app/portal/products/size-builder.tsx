"use client";

import { useState } from 'react';
import { newRowKey, parseSizeEntry, SIZE_PRESETS, SizeRow, suggestSku } from './product-types';

/**
 * Defines a product's sizes, each of which becomes a variant: the size
 * table is the product's variant list. Adding sizes is deliberately cheap --
 * a preset, or one entry like "EUR 36-46" or "S, M, L" -- because typing a
 * dozen SKU/price/stock rows by hand is what made the old form unusable for
 * anything but a one-size product.
 *
 * Price is entered once ("price for all sizes") and flows into every size
 * the merchant hasn't priced individually; per-size overrides are just
 * editing that row. SKUs are generated from the product name + size and
 * only stop following the name once someone edits them by hand.
 */
export function SizeBuilder({
  rows, onRowsChange, productName, invalid,
}: {
  rows: SizeRow[];
  onRowsChange: (updater: (rows: SizeRow[]) => SizeRow[]) => void;
  productName: string;
  /** Row keys with a problem, highlighted; the messages themselves are listed by the parent form. */
  invalid: Set<string>;
}) {
  const [quickAdd, setQuickAdd] = useState('');
  const [basePrice, setBasePrice] = useState(() => rows.find((r) => r.priceKes)?.priceKes ?? '');
  const [baseWas, setBaseWas] = useState(() => rows.find((r) => r.wasPriceKes)?.wasPriceKes ?? '');

  function addSizes(labels: string[]) {
    onRowsChange((current) => {
      const have = new Set(current.map((r) => r.size.trim().toLowerCase()));
      const fresh: SizeRow[] = [];
      for (const label of labels) {
        const key = label.trim().toLowerCase();
        if (!key || have.has(key)) continue;
        have.add(key);
        fresh.push({
          key: newRowKey(),
          size: label.trim(),
          sku: suggestSku(productName, label),
          skuTouched: false,
          priceKes: basePrice,
          priceTouched: false,
          wasPriceKes: baseWas,
          stockOnHand: '0',
          stockTouched: true, // a new row's stock is always sent
          isActive: true,
        });
      }
      return [...current, ...fresh];
    });
  }

  function update(key: string, patch: Partial<SizeRow>) {
    onRowsChange((current) => current.map((r) => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      // A new row's SKU follows its size until someone types one themselves.
      if (patch.size !== undefined && !next.skuTouched && !next.id) next.sku = suggestSku(productName, next.size);
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

  function changeBasePrice(value: string) {
    setBasePrice(value);
    onRowsChange((current) => current.map((r) => (r.priceTouched ? r : { ...r, priceKes: value })));
  }

  function changeBaseWas(value: string) {
    setBaseWas(value);
    onRowsChange((current) => current.map((r) => (r.priceTouched ? r : { ...r, wasPriceKes: value })));
  }

  function submitQuickAdd() {
    if (!quickAdd.trim()) return;
    addSizes(parseSizeEntry(quickAdd));
    setQuickAdd('');
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="portal-field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
          <label htmlFor="pe-base-price">Price for all sizes (KES)</label>
          <input id="pe-base-price" type="number" min={0} step="0.01" value={basePrice} onChange={(e) => changeBasePrice(e.target.value)} placeholder="e.g. 3500" />
        </div>
        <div className="portal-field" style={{ flex: '1 1 160px', marginBottom: 0 }}>
          <label htmlFor="pe-base-was">Compare-at price (optional)</label>
          <input id="pe-base-was" type="number" min={0} step="0.01" value={baseWas} onChange={(e) => changeBaseWas(e.target.value)} placeholder="Shown struck through" />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>Add sizes</span>
        {SIZE_PRESETS.map((preset) => (
          <button type="button" key={preset.label} className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => addSizes(preset.sizes)}>
            {preset.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitQuickAdd(); } }}
          placeholder='Type sizes, e.g. "EUR 36-46" or "S, M, L"'
          aria-label="Add sizes"
          style={{ flex: 1 }}
        />
        <button type="button" className="portal-btn" onClick={submitQuickAdd} disabled={!quickAdd.trim()}>Add</button>
      </div>
      <p className="hint" style={{ fontSize: 12, color: 'var(--p-muted)', marginBottom: 14 }}>
        A range like &ldquo;EUR 36-46&rdquo; adds every size in it. Each size becomes its own variant with its own SKU and stock.
      </p>

      {rows.length === 0 ? (
        <div className="portal-empty">No sizes yet. Add at least one &mdash; use &ldquo;One size&rdquo; for an item that doesn&apos;t come in sizes.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="portal-table pe-sizes">
            <thead>
              <tr><th>Size</th><th>SKU</th><th>Price (KES)</th><th>Compare-at</th><th>Stock</th><th title="Hidden sizes stay in your records but don't show in the shop">Shown</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key} className={`${invalid.has(row.key) ? 'is-invalid' : ''}${row.isActive ? '' : ' is-hidden'}`}>
                  <td><input value={row.size} onChange={(e) => update(row.key, { size: e.target.value })} aria-label="Size" style={{ width: 110 }} /></td>
                  <td><input value={row.sku} onChange={(e) => update(row.key, { sku: e.target.value, skuTouched: true })} aria-label="SKU" style={{ width: 190 }} /></td>
                  <td><input type="number" min={0} step="0.01" value={row.priceKes} onChange={(e) => update(row.key, { priceKes: e.target.value, priceTouched: true })} aria-label="Price" style={{ width: 100 }} /></td>
                  <td><input type="number" min={0} step="0.01" value={row.wasPriceKes} onChange={(e) => update(row.key, { wasPriceKes: e.target.value, priceTouched: true })} aria-label="Compare-at price" style={{ width: 100 }} /></td>
                  <td><input type="number" min={0} step="1" value={row.stockOnHand} onChange={(e) => update(row.key, { stockOnHand: e.target.value, stockTouched: true })} aria-label="Stock" style={{ width: 70 }} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" checked={row.isActive} onChange={(e) => update(row.key, { isActive: e.target.checked })} aria-label="Shown in the shop" style={{ width: 'auto' }} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="portal-btn-ghost" onClick={() => move(row.key, -1)} disabled={index === 0} aria-label="Move up">&uarr;</button>
                    <button type="button" className="portal-btn-ghost" onClick={() => move(row.key, 1)} disabled={index === rows.length - 1} aria-label="Move down">&darr;</button>
                    <button type="button" className="portal-btn-ghost" onClick={() => onRowsChange((c) => c.filter((r) => r.key !== row.key))} aria-label="Remove size">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.some((r) => r.id) ? (
        <p style={{ fontSize: 12, color: 'var(--p-muted)', marginTop: 8 }}>
          Removing a size that has orders keeps it in your records but hides it from the shop.
        </p>
      ) : null}
    </div>
  );
}
