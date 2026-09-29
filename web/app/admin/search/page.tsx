"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '../admin-api';

type ProductResult = {
  id: string;
  name: string;
  brand: string | null;
  isActive: boolean;
  skus: string[];
  shop: { id: string; name: string; slug: string };
};

export default function AdminProductSearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    const res = await adminFetch(`/admin/products/search?q=${encodeURIComponent(q)}`);
    if (res.status === 401) { setAuthFailed(true); return; }
    setResults(await res.json());
    setLoading(false);
  }

  if (authFailed) { router.replace('/admin/login'); return null; }

  return (
    <div>
      <div className="admin-page-head">
        <h3>Product search</h3>
        <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>
          Find which shop a product or SKU belongs to -- useful when a support ticket names an item but not the shop.
        </p>
      </div>

      <form onSubmit={onSearch} style={{ display: 'flex', gap: 8, marginBottom: 20, maxWidth: 480 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Product name, brand, or SKU..."
          aria-label="Search products across every shop"
          style={{ flex: 1 }}
        />
        <button type="submit" className="admin-btn" disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
      </form>

      {results !== null ? (
        results.length === 0 ? (
          <div className="admin-empty">No products match &ldquo;{query}&rdquo;.</div>
        ) : (
          <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Brand</th>
                  <th>SKUs</th>
                  <th>Shop</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.brand ?? <span style={{ color: 'var(--a-muted)' }}>&mdash;</span>}</td>
                    <td style={{ fontSize: 12, color: 'var(--a-muted)' }}>{p.skus.join(', ')}</td>
                    <td><Link href={`/admin/shops/${p.shop.id}`}>{p.shop.name}</Link></td>
                    <td>
                      <span className={`admin-badge ${p.isActive ? 'is-active' : 'is-suspended'}`}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}
