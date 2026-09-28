"use client";

import { useEffect, useState } from 'react';
import { authHeaders, portalFetch } from '../portal-api';

type Variant = { id: string; sku: string; name: string; size: string | null; priceKes: string; wasPriceKes: string | null; stockOnHand: number; isActive: boolean };
type Product = { id: string; name: string; slug: string; description: string | null; imageUrls: string[]; isActive: boolean; isFeatured: boolean; variants: Variant[] };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ name: '', slug: '', sku: '', size: '', priceKes: '', stockOnHand: '0' });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  async function load() {
    const res = await portalFetch('/portal/products');
    if (res.ok) setProducts(await res.json());
  }

  useEffect(() => { load(); }, []);

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

      {products.length === 0 ? (
        <div className="portal-empty">No products yet -- add your first one above.</div>
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
