"use client";

import { useEffect, useState } from 'react';
import { authHeaders, portalFetch } from '../portal-api';

type Variant = { id: string; sku: string; name: string; size: string | null; priceKes: string; wasPriceKes: string | null; stockOnHand: number; isActive: boolean };
type Product = { id: string; name: string; slug: string; description: string | null; imageUrls: string[]; isActive: boolean; isFeatured: boolean; variants: Variant[] };
type Category = { id: string; name: string; slug: string; isActive: boolean };

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function ProductsPage() {
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

  const [form, setForm] = useState({ name: '', slug: '', sku: '', size: '', priceKes: '', stockOnHand: '0' });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await portalFetch('/portal/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        slug: form.slug,
        variants: [{ sku: form.sku, name: form.size || form.name, size: form.size || undefined, priceKes: Number(form.priceKes), stockOnHand: Number(form.stockOnHand) }],
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data?.message || 'Could not create product');
      return;
    }
    setForm({ name: '', slug: '', sku: '', size: '', priceKes: '', stockOnHand: '0' });
    setShowAddForm(false);
    load();
  }

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Products</h3>
        <button className="portal-btn" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Cancel' : 'Add product'}
        </button>
      </div>

      {showAddForm ? (
        <form onSubmit={onCreate} className="portal-card" style={{ marginBottom: 20 }}>
          <h4 style={{ marginBottom: 16 }}>New product</h4>
          <div className="portal-field"><label>Name</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></div>
          <div className="portal-field"><label>Slug</label><input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required /></div>
          <div className="portal-field"><label>SKU</label><input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} required /></div>
          <div className="portal-field"><label>Size (optional)</label><input value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="portal-field" style={{ flex: 1 }}><label>Price (KES)</label><input type="number" value={form.priceKes} onChange={(e) => setForm((f) => ({ ...f, priceKes: e.target.value }))} required /></div>
            <div className="portal-field" style={{ flex: 1 }}><label>Stock on hand</label><input type="number" value={form.stockOnHand} onChange={(e) => setForm((f) => ({ ...f, stockOnHand: e.target.value }))} /></div>
          </div>
          {error ? <div className="portal-alert is-error">{error}</div> : null}
          <button type="submit" className="portal-btn">Add product</button>
        </form>
      ) : null}

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
          {hasFilters ? 'No products match those filters.' : 'No products yet -- add your first one above.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              editing={editingId === p.id}
              onToggleEdit={() => setEditingId(editingId === p.id ? null : p.id)}
              onChanged={load}
            />
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

function ProductRow({ product, editing, onToggleEdit, onChanged }: {
  product: Product; editing: boolean; onToggleEdit: () => void; onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function onToggleActive() {
    await portalFetch(`/portal/products/${product.id}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !product.isActive }),
    });
    onChanged();
  }

  async function onUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211'}/media/upload`, {
        method: 'POST', headers: authHeaders(), body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Upload failed');
      await portalFetch(`/portal/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: [data.url, ...product.imageUrls.filter((u) => u !== data.url)] }),
      });
      onChanged();
    } finally {
      setUploading(false);
    }
  }

  async function onVariantPrice(variantId: string, priceKes: string) {
    await portalFetch(`/portal/products/variants/${variantId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceKes: Number(priceKes) }),
    });
    onChanged();
  }

  async function onVariantStock(variantId: string, stockOnHand: string) {
    await portalFetch(`/portal/products/variants/${variantId}/stock/set`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stockOnHand: Number(stockOnHand) }),
    });
    onChanged();
  }

  return (
    <div className={`portal-product-row${product.isActive ? '' : ' is-inactive'}`} style={{ flexDirection: 'column' }}>
      <div className="portal-product-row-main">
        {product.imageUrls[0] ? (
          <img src={product.imageUrls[0]} alt="" />
        ) : (
          <div className="placeholder" />
        )}
        <div style={{ flex: 1 }}>
          <strong>{product.name}</strong>{' '}
          <span style={{ color: 'var(--p-muted)', fontSize: 13 }}>({product.slug})</span>
          {!product.isActive ? <span className="portal-badge is-cancelled" style={{ marginLeft: 8 }}>Inactive</span> : null}
          {!editing ? (
            <p style={{ marginTop: 4, fontSize: 13, color: 'var(--p-muted)' }}>
              {product.variants.map((v) => `${v.size ?? v.name}: KES ${v.priceKes} / stock ${v.stockOnHand}`).join(', ')}
            </p>
          ) : null}
        </div>
        <div className="portal-product-row-actions">
          <button className="portal-btn-outline portal-btn portal-btn-sm" onClick={onToggleActive}>
            {product.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button className="portal-btn portal-btn-sm" onClick={onToggleEdit}>{editing ? 'Done' : 'Edit'}</button>
        </div>
      </div>

      {editing ? (
        <div className="portal-product-detail">
          <div className="portal-field" style={{ maxWidth: 320 }}>
            <label>Product image</label>
            <input type="file" accept="image/*" onChange={onUploadImage} disabled={uploading} />
            {uploading ? <span className="hint">Uploading...</span> : null}
          </div>

          <table className="portal-table">
            <thead>
              <tr><th>Variant</th><th>Price (KES)</th><th>Stock</th></tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <td>{v.size ?? v.name} ({v.sku})</td>
                  <td>
                    <input
                      type="number"
                      defaultValue={v.priceKes}
                      style={{ width: 100 }}
                      onBlur={(e) => e.target.value !== v.priceKes && onVariantPrice(v.id, e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      defaultValue={v.stockOnHand}
                      style={{ width: 80 }}
                      onBlur={(e) => Number(e.target.value) !== v.stockOnHand && onVariantStock(v.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
