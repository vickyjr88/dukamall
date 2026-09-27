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
    load();
  }

  return (
    <div>
      <h3>Add product</h3>
      <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, maxWidth: 360 }}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        <input placeholder="Slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} required />
        <input placeholder="SKU" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} required />
        <input placeholder="Size (optional)" value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} />
        <input placeholder="Price (KES)" type="number" value={form.priceKes} onChange={(e) => setForm((f) => ({ ...f, priceKes: e.target.value }))} required />
        <input placeholder="Stock on hand" type="number" value={form.stockOnHand} onChange={(e) => setForm((f) => ({ ...f, stockOnHand: e.target.value }))} />
        <button type="submit">Add product</button>
        {error ? <p style={{ color: 'red' }}>{error}</p> : null}
      </form>

      <h3>Products</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
    <div style={{ border: '1px solid #ddd', padding: 12, opacity: product.isActive ? 1 : 0.5 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {product.imageUrls[0] ? (
          <img src={product.imageUrls[0]} alt="" style={{ width: 56, height: 56, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 56, height: 56, background: '#eee' }} />
        )}
        <div style={{ flex: 1 }}>
          <strong>{product.name}</strong> ({product.slug}) {!product.isActive ? '-- inactive' : ''}
        </div>
        <button onClick={onToggleActive}>{product.isActive ? 'Deactivate' : 'Activate'}</button>
        <button onClick={onToggleEdit}>{editing ? 'Done' : 'Edit'}</button>
      </div>

      {editing ? (
        <div style={{ marginTop: 12, paddingLeft: 68 }}>
          <label style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
            Product image{' '}
            <input type="file" accept="image/*" onChange={onUploadImage} disabled={uploading} />
            {uploading ? ' Uploading...' : null}
          </label>

          <table style={{ fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 4 }}>Variant</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Price (KES)</th>
                <th style={{ textAlign: 'left', padding: 4 }}>Stock</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <td style={{ padding: 4 }}>{v.size ?? v.name} ({v.sku})</td>
                  <td style={{ padding: 4 }}>
                    <input
                      type="number"
                      defaultValue={v.priceKes}
                      style={{ width: 90 }}
                      onBlur={(e) => e.target.value !== v.priceKes && onVariantPrice(v.id, e.target.value)}
                    />
                  </td>
                  <td style={{ padding: 4 }}>
                    <input
                      type="number"
                      defaultValue={v.stockOnHand}
                      style={{ width: 70 }}
                      onBlur={(e) => Number(e.target.value) !== v.stockOnHand && onVariantStock(v.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ margin: '8px 0 0 68px', fontSize: 13, color: '#666' }}>
          {product.variants.map((v) => `${v.size ?? v.name}: KES ${v.priceKes} / stock ${v.stockOnHand}`).join(', ')}
        </p>
      )}
    </div>
  );
}
