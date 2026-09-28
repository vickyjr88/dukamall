"use client";

import { useState } from 'react';
import { ShopProduct } from '@/app/lib/api';
import { useCart } from '@/app/lib/cart';
import { FavoriteButton } from '@/app/favorite-button';

export function ProductClient({ product }: { product: ShopProduct }) {
  const cart = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? null);
  const [manualSize, setManualSize] = useState('');
  const [added, setAdded] = useState(false);
  const chosen = product.variants.find((v) => v.id === variantId) || null;
  const isOnSale = chosen?.wasPriceKes && Number(chosen.wasPriceKes) > Number(chosen.priceKes);

  return (
    <main className="shop-container shop-section">
      <div className="pdp-layout">
        <div className="pdp-gallery-main">
          {product.imageUrls[0] ? (
            <img src={product.imageUrls[0]} alt={product.name} />
          ) : (
            <div className="product-card-placeholder" style={{ fontSize: 'var(--shop-text-3xl)' }}>{product.name.charAt(0)}</div>
          )}
        </div>

        <div className="pdp-info">
          {product.category ? <span className="eyebrow">{product.category.name}</span> : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <h1>{product.name}</h1>
            <FavoriteButton productId={product.id} />
          </div>

          {chosen ? (
            <div className="pdp-price">
              {isOnSale ? <span className="was">KES {Number(chosen.wasPriceKes).toLocaleString()}</span> : null}
              <span>KES {Number(chosen.priceKes).toLocaleString()}</span>
              {isOnSale ? <span className="sale-badge">Sale</span> : null}
            </div>
          ) : null}

          {product.description ? <p className="pdp-description">{product.description}</p> : null}

          {product.variants.length > 0 ? (
            <div>
              <div className="pdp-field-label">
                <span>Size</span>
                {chosen ? <span className="selected-value">{chosen.size ?? chosen.name}</span> : null}
              </div>
              <div className="size-grid">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`size-swatch${v.id === variantId ? ' is-selected' : ''}`}
                    disabled={v.stockOnHand <= 0}
                    style={v.stockOnHand <= 0 ? { opacity: 0.35, textDecoration: 'line-through', cursor: 'not-allowed' } : undefined}
                    onClick={() => setVariantId(v.id)}
                  >
                    {v.size ?? v.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pdp-actions">
            <button
              className="btn btn-primary btn-block"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return;
                cart.add({
                  variantId: chosen.id,
                  productSlug: product.slug,
                  name: product.name,
                  size: chosen.size ?? chosen.name,
                  sku: chosen.sku,
                  priceKes: Number(chosen.priceKes),
                  imageUrl: product.imageUrls[0] || null,
                });
                setAdded(true);
                window.setTimeout(() => setAdded(false), 2000);
              }}
            >
              {added ? 'Added to cart' : chosen ? 'Add to cart' : 'Select a size'}
            </button>
          </div>

          <div className="manual-size-block">
            <label htmlFor="manual-size-input">Don&apos;t see your size?</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                id="manual-size-input"
                value={manualSize}
                onChange={(e) => setManualSize(e.target.value)}
                placeholder="Type your size"
              />
              {manualSize.trim() ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    cart.add({
                      variantId: null,
                      productSlug: product.slug,
                      name: product.name,
                      size: manualSize.trim(),
                      sku: '',
                      priceKes: chosen ? Number(chosen.priceKes) : 0,
                      imageUrl: product.imageUrls[0] || null,
                      isCustomSize: true,
                    });
                    setManualSize('');
                    setAdded(true);
                    window.setTimeout(() => setAdded(false), 2000);
                  }}
                >
                  Add
                </button>
              ) : null}
            </div>
          </div>

          <div className="trust-row">
            <span>Secure checkout</span>
            <span>Fast local delivery</span>
            <span>WhatsApp support</span>
          </div>
        </div>
      </div>
    </main>
  );
}
