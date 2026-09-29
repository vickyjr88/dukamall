"use client";

/**
 * The home page's product search + filters. Filters live in the query
 * string (useSearchParams + router.replace) so a filtered view is
 * shareable, survives a refresh, and the back button behaves -- same
 * approach as drip-crm's own shop-client.tsx, trimmed to this platform's
 * simpler flat-category schema and its "never a dead end" stock convention
 * (no in-stock-only filter here).
 */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProductCard } from '@/app/product-card';
import { ShopCategory, ShopFilters, ShopProduct } from '@/app/lib/api';
import { useShopFetch } from '@/app/lib/shop-id-context';

export function StorefrontSearch({
  initialProducts,
  categories,
  filters,
}: {
  initialProducts: ShopProduct[];
  categories: ShopCategory[];
  filters: ShopFilters;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const shopFetch = useShopFetch();

  const category = params.get('category') || '';
  const brand = params.get('brand') || '';
  const size = params.get('size') || '';
  const search = params.get('search') || '';
  const sort = params.get('sort') || '';
  const minPrice = params.get('minPrice') || '';
  const maxPrice = params.get('maxPrice') || '';

  const [products, setProducts] = useState(initialProducts);
  const [loading, setLoading] = useState(false);
  const [searchDraft, setSearchDraft] = useState(search);
  useEffect(() => setSearchDraft(search), [search]);

  // The server already fetched exactly this URL's filters for the first
  // paint; skip that one redundant duplicate client fetch and let this
  // effect run only when something actually changes afterwards.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ category, brand, size, search, sort, minPrice, maxPrice })) {
      if (value) query.set(key, value);
    }
    const qs = query.toString();
    void shopFetch(`/shop/products${qs ? `?${qs}` : ''}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: ShopProduct[]) => {
        if (cancelled) return;
        setProducts(rows);
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, brand, size, search, sort, minPrice, maxPrice]);

  /** Applies several query-param changes at once -- two setParam calls in a
   * row would both read the same stale params and the second would
   * overwrite the first. */
  const setParams = useCallback((changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.replace(next.toString() ? `/?${next.toString()}#catalog` : '/#catalog', { scroll: false });
  }, [params, router]);

  const setParam = useCallback((key: string, value: string) => setParams({ [key]: value }), [setParams]);

  const hasFilters = Boolean(category || brand || size || search || sort || minPrice || maxPrice);

  return (
    <section className="shop-section" id="catalog">
      <div className="shop-container">
        <div className="shop-section-head">
          <div>
            <span className="eyebrow">Full catalog</span>
            <h2>All products</h2>
          </div>
        </div>

        <div className="pf-bar" aria-label="Search and filter products">
          <form
            className="pf-search"
            onSubmit={(e) => { e.preventDefault(); setParam('search', searchDraft.trim()); }}
          >
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
            />
            <button type="submit" className="btn btn-primary btn-sm">Search</button>
          </form>

          <div className="pf-row">
            <label>
              <span>Category</span>
              <select value={category} onChange={(e) => setParam('category', e.target.value)}>
                <option value="">All</option>
                {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
            <label>
              <span>Brand</span>
              <select value={brand} onChange={(e) => setParam('brand', e.target.value)}>
                <option value="">All</option>
                {filters.brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={sort} onChange={(e) => setParam('sort', e.target.value)}>
                <option value="">Newest</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          {filters.sizes.length > 0 ? (
            <div className="pf-sizes">
              <span>Size</span>
              <div className="pf-size-chips">
                <button type="button" className={`pf-chip${size ? '' : ' is-on'}`} onClick={() => setParam('size', '')}>
                  Any
                </button>
                {filters.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`pf-chip${size === s ? ' is-on' : ''}`}
                    onClick={() => setParam('size', size === s ? '' : s)}
                  >
                    {s.replace('EUR ', '')}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pf-foot">
            <span className="pf-count">{loading ? 'Loading...' : `${products.length} product${products.length === 1 ? '' : 's'}`}</span>
            {hasFilters ? <Link href="/#catalog" className="pf-clear">Clear all</Link> : null}
          </div>
        </div>

        {products.length === 0 && !loading ? (
          <div className="empty-state">
            <h3>Nothing matches those filters</h3>
            <p>Try a different search term or clear your filters to see the full catalog.</p>
            <Link href="/#catalog" className="btn btn-primary">Clear filters</Link>
          </div>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
