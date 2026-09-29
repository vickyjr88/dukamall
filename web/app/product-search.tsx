"use client";

/**
 * Search-as-you-type over the catalogue, with a dropdown of matches --
 * ported from drip-crm's own components/product-search.tsx. The full-grid
 * search (storefront-search.tsx) is submit-only: type, press Enter/Search,
 * wait for the grid to reload. For "do you have Jordans" -- most of what
 * gets typed -- that's several steps to answer a yes/no question. This
 * answers it while the word is still being typed and links straight to the
 * product, rather than to a filtered grid the shopper then has to read.
 * Enter (with nothing highlighted) still runs the full-grid search;
 * this is a shortcut past it, not a replacement.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShopProduct } from './lib/api';
import { useShopFetch } from './lib/shop-id-context';

/** Matches shown at once. More than this is a grid, which the page already has. */
const MAX_RESULTS = 6;
/**
 * Wait after the last keystroke before asking the server -- short enough to
 * feel immediate, long enough that typing a word is one request rather than
 * six.
 */
const DEBOUNCE_MS = 220;

function currentPriceLabel(product: ShopProduct) {
  if (product.variants.length === 0) return null;
  const prices = product.variants.map((v) => Number(v.priceKes));
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const anyInStock = product.variants.some((v) => v.stockOnHand > 0);
  const label = low === high ? `KES ${low.toLocaleString()}` : `From KES ${low.toLocaleString()}`;
  return `${label}${anyInStock ? '' : ' · to order'}`;
}

export function ProductSearch({
  value,
  onChange,
  onSubmit,
  category,
  placeholder = 'Search products...',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** Narrows suggestions to a category, matching what the grid would return. */
  category?: string;
  placeholder?: string;
}) {
  const shopFetch = useShopFetch();
  const [results, setResults] = useState<ShopProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  /** Which row the arrow keys are on; -1 means the input itself. */
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  /** Rejects a response that arrives after a newer one was already sent. */
  const latest = useRef(0);

  const term = value.trim();

  useEffect(() => {
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const requestId = ++latest.current;
    setLoading(true);
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ search: term });
      if (category) query.set('category', category);
      void shopFetch(`/shop/products?${query.toString()}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((rows: ShopProduct[]) => {
          // A slower earlier request must not overwrite a newer one's results.
          if (requestId !== latest.current) return;
          setResults(Array.isArray(rows) ? rows.slice(0, MAX_RESULTS) : []);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, category]);

  // Close when the focus or the pointer goes elsewhere, so the panel does
  // not sit over the grid after the shopper has moved on.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  useEffect(() => setActive(-1), [results]);

  const showPanel = open && term.length >= 2;

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (!showPanel || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((prev) => (prev + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      // A highlighted row wins over submitting the form: the shopper picked
      // a product, not a search.
      event.preventDefault();
      const picked = results[active];
      if (picked) window.location.href = `/shop/${picked.slug}`;
    }
  }, [showPanel, results, active]);

  const empty = useMemo(
    () => showPanel && !loading && results.length === 0,
    [showPanel, loading, results.length],
  );

  return (
    <div className="ps-box" ref={boxRef}>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label="Search products"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="ps-results"
        aria-autocomplete="list"
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showPanel ? (
        <div className="ps-results" id="ps-results" role="listbox">
          {results.map((product, index) => {
            const image = product.imageUrls[0];
            return (
              <Link
                key={product.id}
                href={`/shop/${product.slug}`}
                className={`ps-result${index === active ? ' is-active' : ''}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => setOpen(false)}
              >
                <span className="ps-thumb">
                  {image ? (
                    <img src={image} alt="" loading="lazy" />
                  ) : (
                    // A product with no photo still occupies the same
                    // space, or the rows jump as the list changes.
                    <span className="ps-thumb-empty" aria-hidden="true" />
                  )}
                </span>
                <span className="ps-result-text">
                  <strong>{product.name}</strong>
                  <small>
                    {product.brand ? `${product.brand} · ` : ''}
                    {currentPriceLabel(product)}
                  </small>
                </span>
              </Link>
            );
          })}

          {loading && results.length === 0 ? (
            <p className="ps-note">Searching...</p>
          ) : null}

          {empty ? <p className="ps-note">Nothing matches &ldquo;{term}&rdquo;.</p> : null}

          {results.length > 0 ? (
            <button type="button" className="ps-all" onClick={() => { setOpen(false); onSubmit(); }}>
              See all results for &ldquo;{term}&rdquo;
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
