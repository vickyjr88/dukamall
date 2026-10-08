"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { authHeaders, portalFetch, PORTAL_API_BASE } from '../portal-api';
import { useSession } from '../portal-session';

type Variant = { id: string; sku: string; name: string; size: string | null; priceKes: string; wasPriceKes: string | null; stockOnHand: number; isActive: boolean };
type Product = { id: string; name: string; slug: string; description: string | null; imageUrls: string[]; isActive: boolean; isFeatured: boolean; variants: Variant[] };
type Category = { id: string; name: string; slug: string; isActive: boolean };

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function ProductsPage() {
  const { isOwner } = useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [error, setError] = useState<string | null>(null);

  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ updatedCount: number; notFound: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    if (category) query.set('category', category);
    if (status) query.set('status', status);
    query.set('page', String(page));
    query.set('pageSize', String(pageSize));
    const res = await portalFetch(`/portal/products?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [search, category, status, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    portalFetch('/portal/products/categories').then((r) => r.json()).then(setCategories).catch(() => {});
  }, []);

  // Any filter change resets to page 1 -- staying on page 6 of a now-3-page
  // result would just show an empty page with no explanation.
  function updateFilter(next: { search?: string; category?: string; status?: '' | 'active' | 'inactive' }) {
    if (next.search !== undefined) setSearch(next.search);
    if (next.category !== undefined) setCategory(next.category);
    if (next.status !== undefined) setStatus(next.status);
    setPage(1);
  }

  const hasFilters = Boolean(search || category || status);

  function onExportCsv() {
    // A plain link can't carry the Authorization header, so this opens a
    // same-tab navigation with the token in a way the browser will still
    // download rather than render -- fetch-then-blob, same pattern the
    // admin console's shop-data export uses.
    (async () => {
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
    })();
  }

  async function onImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${PORTAL_API_BASE}/portal/products/import-csv`, {
        method: 'POST', headers: authHeaders(), body,
      });
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

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3>Products</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {isOwner ? (
            <>
              <button className="portal-btn-outline portal-btn" onClick={onExportCsv}>Export CSV</button>
              <button className="portal-btn-outline portal-btn" onClick={() => csvInputRef.current?.click()} disabled={importBusy}>
                {importBusy ? 'Importing...' : 'Import CSV'}
              </button>
              <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onImportCsv} />
            </>
          ) : null}
          <Link href="/portal/products/new" className="portal-btn">Add product</Link>
        </div>
      </div>

      {importResult ? (
        <div className={`portal-alert ${importResult.updatedCount > 0 || importResult.notFound.length === 0 ? 'is-success' : 'is-error'}`} style={{ marginBottom: 16 }}>
          Updated {importResult.updatedCount} variant{importResult.updatedCount === 1 ? '' : 's'}.
          {importResult.notFound.length > 0 ? (
            <> {importResult.notFound.length} SKU{importResult.notFound.length === 1 ? '' : 's'} not found: {importResult.notFound.join(', ')}</>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="portal-alert is-error" style={{ marginBottom: 16 }}>{error}</div> : null}

      <div className="portal-card" style={{ marginBottom: 16 }}>
        <form
          style={{ display: 'flex', gap: 8, marginBottom: 14 }}
          onSubmit={(e) => { e.preventDefault(); updateFilter({ search: searchDraft.trim() }); }}
        >
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by name or SKU..."
            aria-label="Search products"
            style={{ flex: 1 }}
          />
          <button type="submit" className="portal-btn">Search</button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
            Category
            <select value={category} onChange={(e) => updateFilter({ category: e.target.value })} style={{ minWidth: 160 }}>
              <option value="">All</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}{!c.isActive ? ' (inactive)' : ''}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
            Status
            <select value={status} onChange={(e) => updateFilter({ status: e.target.value as '' | 'active' | 'inactive' })} style={{ minWidth: 140 }}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
            Per page
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ minWidth: 90 }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {hasFilters ? (
            <button
              type="button"
              className="portal-btn-ghost"
              onClick={() => { setSearchDraft(''); setSearch(''); setCategory(''); setStatus(''); setPage(1); }}
            >
              Clear filters
            </button>
          ) : null}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--p-muted)' }}>
            {loading ? 'Loading...' : `${total} product${total === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {products.length === 0 && !loading ? (
        <div className="portal-empty">
          {hasFilters ? 'No products match those filters.' : <>No products yet. <Link href="/portal/products/new">Add your first one</Link>.</>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {products.map((p) => (
            <ProductRow key={p.id} product={p} onChanged={load} />
          ))}
        </div>
      )}

      {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onChange={setPage} /> : null}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  // Windowed page numbers (current ± 2) with the first/last page always
  // shown -- a flat 1..N list would be unreadable once a catalogue has
  // dozens of pages.
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = Array.from(pages).sort((a, b) => a - b);

  const items: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push('ellipsis');
    items.push(p);
    prev = p;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20 }}>
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {items.map((item, i) =>
        item === 'ellipsis' ? (
          <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--p-muted)' }}>&hellip;</span>
        ) : (
          <button
            key={item}
            className={item === page ? 'portal-btn portal-btn-sm' : 'portal-btn-outline portal-btn portal-btn-sm'}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}

/**
 * One line per product -- name, a one-line summary of its sizes, and the two
 * things worth doing from a list (hide/show, open the editor). Everything
 * else happens on the product's own screen (/portal/products/[id]).
 */
function ProductRow({ product, onChanged }: { product: Product; onChanged: () => void }) {
  async function onToggleActive() {
    await portalFetch(`/portal/products/${product.id}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !product.isActive }),
    });
    onChanged();
  }

  // Sizes as the shop shows them; hidden ones are noted separately so the
  // summary matches what a shopper sees.
  const variants = product.variants.filter((v) => v.isActive);
  const hiddenCount = product.variants.length - variants.length;
  const prices = variants.map((v) => Number(v.priceKes));
  const stock = variants.reduce((sum, v) => sum + v.stockOnHand, 0);
  const sizes = variants.map((v) => v.size ?? v.name);
  const priceText = prices.length
    ? Math.min(...prices) === Math.max(...prices)
      ? `KES ${Math.min(...prices).toLocaleString()}`
      : `KES ${Math.min(...prices).toLocaleString()} - ${Math.max(...prices).toLocaleString()}`
    : 'No price';

  return (
    <div className={`portal-product-row${product.isActive ? '' : ' is-inactive'}`} style={{ flexDirection: 'column' }}>
      <div className="portal-product-row-main">
        {product.imageUrls[0] ? <img src={product.imageUrls[0]} alt="" /> : <div className="placeholder" />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/portal/products/${product.id}`}><strong>{product.name}</strong></Link>{' '}
          {!product.isActive ? <span className="portal-badge is-cancelled" style={{ marginLeft: 8 }}>Inactive</span> : null}
          <p style={{ marginTop: 4, fontSize: 13, color: 'var(--p-muted)' }}>
            {priceText} &middot; {stock.toLocaleString()} in stock &middot; {sizes.length} size{sizes.length === 1 ? '' : 's'}
            {sizes.length ? `: ${sizes.slice(0, 8).join(', ')}${sizes.length > 8 ? ` +${sizes.length - 8} more` : ''}` : ''}
            {hiddenCount ? ` \u00b7 ${hiddenCount} hidden` : ''}
          </p>
        </div>
        <div className="portal-product-row-actions">
          <button className="portal-btn-outline portal-btn portal-btn-sm" onClick={onToggleActive}>
            {product.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <Link href={`/portal/products/${product.id}`} className="portal-btn portal-btn-sm">Edit</Link>
        </div>
      </div>
    </div>
  );
}
