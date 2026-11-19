"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { authHeaders, portalFetch, PORTAL_API_BASE } from '../portal-api';
import { useSession } from '../portal-session';
import { Chips, Pager, SearchField, SortHeader, SortSelect, useListState, useSelection } from '../list-kit';
import { orderedValues } from './product-types';

type Variant = { id: string; sku: string; name: string; size: string | null; attributes?: Record<string, string> | null; priceKes: string; wasPriceKes: string | null; stockOnHand: number; isActive: boolean };
type Summary = { minPriceKes: number | null; maxPriceKes: number | null; stock: number; stockState: 'in' | 'low' | 'out'; onOffer: boolean; hasPhoto: boolean };
type Product = {
  id: string; name: string; slug: string; brand: string | null; imageUrls: string[]; isActive: boolean; isFeatured: boolean;
  category: { name: string } | null; variants: Variant[]; summary: Summary; sold30: number; views30: number;
};
type Category = { id: string; name: string; slug: string; isActive: boolean };
type Facets = { all: number; out: number; low: number; noPhoto: number; onOffer: number; featured: number };

// The quick filters are one choice, mapped to the API's `stock` or `flag`.
const VIEWS = { '': {}, out: { stock: 'out' }, low: { stock: 'low' }, no_photo: { flag: 'no_photo' }, on_offer: { flag: 'on_offer' }, featured: { flag: 'featured' } } as const;
type View = keyof typeof VIEWS;

const SORTS = [
  { value: 'newest', label: 'Newest first' }, { value: 'updated', label: 'Recently edited' }, { value: 'name', label: 'Name A to Z' },
  { value: 'price_asc', label: 'Price: low to high' }, { value: 'price_desc', label: 'Price: high to low' },
  { value: 'stock_asc', label: 'Stock: lowest first' }, { value: 'stock_desc', label: 'Stock: highest first' },
  { value: 'sold', label: 'Best selling (30 days)' }, { value: 'viewed', label: 'Most viewed (30 days)' }, { value: 'oldest', label: 'Oldest first' },
];

const kes = (n: number) => `KES ${n.toLocaleString()}`;

export default function ProductsPage() {
  const { isOwner } = useSession();
  const { state, set, reset, ready, dirty } = useListState({ category: '', status: '', view: '' }, { sort: 'newest' });
  const selection = useSelection();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ updatedCount: number; notFound: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams({ page: String(state.page), pageSize: String(state.size), sort: state.sort });
    if (state.q) query.set('search', state.q);
    if (state.category) query.set('category', state.category);
    if (state.status) query.set('status', state.status);
    for (const [k, v] of Object.entries(VIEWS[(state.view as View) in VIEWS ? (state.view as View) : ''])) query.set(k, v);
    try {
      const res = await portalFetch(`/portal/products?${query.toString()}`);
      if (!res.ok) throw new Error('Could not load products');
      const data = await res.json();
      setProducts(data.products);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setFacets(data.facets);
      setError(null);
      // The server clamps a page past the end (a filter shrank the list); follow it so the pager is honest.
      if (data.page !== state.page) set({ page: data.page });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [state.page, state.size, state.sort, state.q, state.category, state.status, state.view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (ready) void load(); }, [ready, load]);
  useEffect(() => { portalFetch('/portal/products/categories').then((r) => r.json()).then(setCategories).catch(() => {}); }, []);

  async function bulk(isActive: boolean) {
    const ids = Array.from(selection.ids);
    const res = await portalFetch('/portal/products/bulk-active', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, isActive }),
    });
    if (!res.ok) { setError('Could not change those products'); return; }
    setNotice(`${ids.length} product${ids.length === 1 ? '' : 's'} ${isActive ? 'shown in' : 'hidden from'} the shop.`);
    selection.clear();
    await load();
  }

  async function toggleOne(p: Product) {
    await portalFetch(`/portal/products/${p.id}/active`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !p.isActive }),
    });
    await load();
  }

  async function onExportCsv() {
    const res = await portalFetch('/portal/products/export-csv');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${PORTAL_API_BASE}/portal/products/import-csv`, { method: 'POST', headers: authHeaders(), body });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Import failed');
      setImportResult(data);
      await load();
    } catch (err: any) {
      setImportResult({ updatedCount: 0, notFound: [] });
      setError(err.message);
    } finally {
      setImportBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  }

  const pageIds = products.map((p) => p.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selection.ids.has(id));
  const chip = (value: View, label: string, count: number | undefined, tone?: 'warn' | 'danger') => ({ value, label, count, tone });

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3>Products</h3>
          <p style={{ color: 'var(--p-muted)', fontSize: 13 }}>{facets ? `${facets.all.toLocaleString()} in this view` : 'Loading...'}{facets && facets.out > 0 ? ` · ${facets.out} sold out` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isOwner ? (
            <>
              <button className="portal-btn-outline portal-btn" onClick={onExportCsv}>Export CSV</button>
              <button className="portal-btn-outline portal-btn" onClick={() => csvInputRef.current?.click()} disabled={importBusy}>{importBusy ? 'Importing...' : 'Import CSV'}</button>
              <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onImportCsv} />
            </>
          ) : null}
          <Link href="/portal/products/new" className="portal-btn">Add product</Link>
        </div>
      </div>

      {importResult ? (
        <div className={`portal-alert ${importResult.updatedCount > 0 || importResult.notFound.length === 0 ? 'is-success' : 'is-error'}`}>
          Updated {importResult.updatedCount} variant{importResult.updatedCount === 1 ? '' : 's'}.
          {importResult.notFound.length > 0 ? <> {importResult.notFound.length} SKU{importResult.notFound.length === 1 ? '' : 's'} not found: {importResult.notFound.join(', ')}</> : null}
        </div>
      ) : null}
      {notice ? <div className="portal-alert is-success">{notice}</div> : null}
      {error ? <div className="portal-alert is-error">{error}</div> : null}

      <div className="portal-card" style={{ marginBottom: 14 }}>
        <div className="lk-toolbar">
          <SearchField value={state.q} onChange={(q) => set({ q })} placeholder="Search name, brand, category or SKU" label="Search products" />
          <label className="lk-field">
            Category
            <select value={state.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}{!c.isActive ? ' (hidden)' : ''}</option>)}
            </select>
          </label>
          <label className="lk-field">
            Shown in shop
            <select value={state.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Shown and hidden</option>
              <option value="active">Shown</option>
              <option value="inactive">Hidden</option>
            </select>
          </label>
          <SortSelect value={state.sort} onChange={(sort) => set({ sort })} options={SORTS} />
        </div>
        <Chips
          value={(state.view as View) || ''}
          onChange={(view) => set({ view })}
          chips={[
            chip('', 'All', facets?.all),
            chip('out', 'Sold out', facets?.out, 'danger'),
            chip('low', 'Running low', facets?.low, 'warn'),
            chip('no_photo', 'No photo', facets?.noPhoto, 'warn'),
            chip('on_offer', 'On offer', facets?.onOffer),
            chip('featured', 'Featured', facets?.featured),
          ]}
        />
        {dirty ? <div style={{ marginTop: 10 }}><button type="button" className="portal-btn-ghost" onClick={() => { reset(); selection.clear(); }}>Clear search and filters</button></div> : null}
      </div>

      {selection.ids.size > 0 ? (
        <div className="lk-bulkbar" role="region" aria-label="Selected products">
          <strong>{selection.ids.size} selected</strong>
          <button type="button" className="portal-btn portal-btn-sm portal-btn-outline" onClick={() => bulk(true)}>Show in shop</button>
          <button type="button" className="portal-btn portal-btn-sm portal-btn-outline" onClick={() => bulk(false)}>Hide from shop</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="portal-btn-ghost" style={{ color: '#fff' }} onClick={selection.clear}>Clear selection</button>
        </div>
      ) : null}

      {products.length === 0 && !loading ? (
        <div className="portal-card portal-empty">
          {dirty ? 'No products match that.' : <>No products yet. <Link href="/portal/products/new">Add your first one</Link>.</>}
        </div>
      ) : (
        <div className="portal-card pl-wrap" aria-busy={loading} style={loading ? { opacity: 0.6 } : undefined}>
          <table className="pl-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={(e) => selection.setMany(pageIds, e.target.checked)} />
                </th>
                <SortHeader label="Product" asc="name" desc="name_desc" sort={state.sort} onSort={(sort) => set({ sort })} />
                <th className="pl-hide-sm">Sizes</th>
                <SortHeader label="Price" asc="price_asc" desc="price_desc" sort={state.sort} onSort={(sort) => set({ sort })} />
                <SortHeader label="Stock" asc="stock_asc" desc="stock_desc" sort={state.sort} onSort={(sort) => set({ sort })} />
                <th className="pl-num pl-hide-md" title="Units sold in the last 30 days (not counting cancelled orders)">Sold 30d</th>
                <th className="pl-num pl-hide-md" title="Product page views in the last 30 days">Views 30d</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => <Row key={p.id} p={p} selected={selection.ids.has(p.id)} onSelect={() => selection.toggle(p.id)} onToggle={() => toggleOne(p)} />)}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={state.page} pageSize={state.size} total={total} totalPages={totalPages} onPage={(page) => set({ page })} onSize={(size) => set({ size })} />
    </div>
  );
}

function Row({ p, selected, onSelect, onToggle }: { p: Product; selected: boolean; onSelect: () => void; onToggle: () => void }) {
  const [broken, setBroken] = useState(false);
  const s = p.summary;
  const shown = p.variants.filter((v) => v.isActive);
  const optioned = shown.some((v) => orderedValues(v.attributes ?? undefined).length > 0);
  const labels = optioned ? shown.map((v) => orderedValues(v.attributes ?? undefined).join(' / ')) : shown.map((v) => v.size ?? '').filter(Boolean);
  const photo = p.imageUrls[0];
  const price = s.minPriceKes === null ? 'No price' : s.minPriceKes === s.maxPriceKes ? kes(s.minPriceKes) : `${kes(s.minPriceKes)} – ${(s.maxPriceKes ?? 0).toLocaleString()}`;
  const was = s.onOffer ? Math.max(...shown.map((v) => Number(v.wasPriceKes ?? 0))) : null;
  const meta = [p.brand, p.category?.name].filter(Boolean).join(' · ');
  const hidden = p.variants.length - shown.length;

  return (
    <tr className={`${p.isActive ? '' : 'is-inactive'}${selected ? ' is-selected' : ''}`}>
      <td className="pl-keep"><input type="checkbox" aria-label={`Select ${p.name}`} checked={selected} onChange={onSelect} /></td>
      <td>
        <div className="pl-product">
          {photo && !broken
            ? <img className="pl-thumb" src={photo} alt="" loading="lazy" onError={() => setBroken(true)} />
            : <div className="pl-thumb is-empty" title="This product has no photo, so shoppers see a blank card">{photo ? 'Photo\nmissing' : 'No\nphoto'}</div>}
          <div style={{ minWidth: 0 }}>
            <Link href={`/portal/products/${p.id}`} className="pl-name">{p.name}</Link>
            <div className="pl-sub">
              {meta || 'No category'}
              {!p.isActive ? <span className="pl-tag">Hidden</span> : null}
              {p.isFeatured ? <span className="pl-tag">Featured</span> : null}
              {s.onOffer ? <span className="pl-tag is-offer">Offer</span> : null}
            </div>
            <div className="pl-sub">{p.variants[0]?.sku ?? 'No SKU'}{p.variants.length > 1 ? ` +${p.variants.length - 1}` : ''}</div>
          </div>
        </div>
      </td>
      <td className="pl-hide-sm" style={{ minWidth: 150, maxWidth: 210 }}>
        {labels.length ? (
          <span title={labels.join(', ')} className="pl-sub" style={{ margin: 0 }}>
            {labels.slice(0, 4).join(', ')}{labels.length > 4 ? ` +${labels.length - 4}` : ''}{hidden ? ` (${hidden} hidden)` : ''}
          </span>
        ) : <span className="pl-sub">{shown.length > 1 ? `${shown.length} options` : 'One way only'}</span>}
      </td>
      <td className="pl-price">{price}{was ? <span className="pl-was">{was.toLocaleString()}</span> : null}</td>
      <td>
        <span className={`pl-stock${s.stockState === 'low' ? ' is-low' : s.stockState === 'out' ? ' is-out' : ''}`}>
          {s.stockState === 'out' ? 'Sold out' : s.stockState === 'low' ? `Low · ${s.stock}` : `${s.stock.toLocaleString()} in stock`}
        </span>
      </td>
      <td className="pl-num pl-hide-md">{p.sold30 || <span className="pl-sub">&ndash;</span>}</td>
      <td className="pl-num pl-hide-md">{p.views30 || <span className="pl-sub">&ndash;</span>}</td>
      <td className="pl-keep">
        <div className="pl-actions">
          <Link href={`/portal/share?product=${encodeURIComponent(p.slug)}`} className="portal-btn portal-btn-sm portal-btn-outline" title="Share this product on WhatsApp and social media">Share</Link>
          <button type="button" className="portal-btn portal-btn-sm portal-btn-outline" onClick={onToggle}>{p.isActive ? 'Hide' : 'Show'}</button>
          <Link href={`/portal/products/${p.id}`} className="portal-btn portal-btn-sm">Edit</Link>
        </div>
      </td>
    </tr>
  );
}
