"use client";

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

type Variant = { id: string; sku: string; name: string; size: string | null; priceKes: string; stockOnHand: number };
type Product = { id: string; name: string; slug: string; isActive: boolean; variants: Variant[] };

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('shops_platform_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ name: '', slug: '', sku: '', size: '', priceKes: '', stockOnHand: '0' });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`${API_BASE}/portal/products`, { headers: authHeaders() as HeadersInit });
    if (res.ok) setProducts(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${API_BASE}/portal/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      <form onSubmit={onCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
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
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} ({p.slug}) -- {p.variants.map((v) => `${v.size ?? v.name}: KES ${v.priceKes} / stock ${v.stockOnHand}`).join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}
