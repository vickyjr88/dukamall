"use client";

import { useState } from 'react';
import { ShopProduct } from '@/app/lib/api';
import { useCart } from '@/app/lib/cart';
import { FavoriteButton } from '@/app/favorite-button';

export function ProductClient({ product }: { product: ShopProduct }) {
  const cart = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? null);
  const [manualSize, setManualSize] = useState('');
  const chosen = product.variants.find((v) => v.id === variantId) || null;

  return (
    <main className="shop-container">
      {product.imageUrls[0] ? <img src={product.imageUrls[0]} alt={product.name} style={{ width: '100%', maxWidth: 420 }} /> : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 style={{ margin: 0 }}>{product.name}</h1>
        <FavoriteButton productId={product.id} />
      </div>
      {product.description ? <p>{product.description}</p> : null}

      {product.variants.length > 0 ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {product.variants.map((v) => (
            <button
              key={v.id}
              className="btn"
              style={{ background: v.id === variantId ? 'var(--shop-primary)' : '#fff', color: v.id === variantId ? '#fff' : 'var(--shop-ink)', border: '1px solid var(--shop-line)' }}
              onClick={() => setVariantId(v.id)}
            >
              {v.size ?? v.name}
            </button>
          ))}
        </div>
      ) : null}

      {chosen ? <p className="price">KES {Number(chosen.priceKes).toLocaleString()}</p> : null}

      <button
        className="btn"
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
        }}
      >
        Add to cart
      </button>

      <div style={{ marginTop: 16 }}>
        <label>
          <div>My size isn&apos;t listed</div>
          <input value={manualSize} onChange={(e) => setManualSize(e.target.value)} placeholder="Type your size" />
        </label>
        {manualSize.trim() ? (
          <button
            className="btn btn-accent"
            style={{ marginTop: 8, display: 'block' }}
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
            }}
          >
            Add size {manualSize.trim()} to cart (pending confirmation)
          </button>
        ) : null}
      </div>
    </main>
  );
}
