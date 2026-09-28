"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useCustomerFetch } from '@/app/lib/use-customer-fetch';
import { ProductCard } from '@/app/product-card';
import { ShopProduct } from '@/app/lib/api';

type Favorite = { id: string; product: ShopProduct };

export default function FavoritesPage() {
  const router = useRouter();
  const { customer, ready } = useCustomerAuth();
  const customerFetch = useCustomerFetch();
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);

  async function load() {
    const res = await customerFetch('/account/favorites');
    setFavorites(await res.json());
  }

  useEffect(() => {
    if (ready && !customer) { router.replace('/account/login'); return; }
    if (customer) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, customer, router]);

  async function onRemove(productId: string) {
    await customerFetch(`/account/favorites/${productId}`, { method: 'DELETE' });
    load();
  }

  if (!ready || !customer) return null;

  return (
    <main className="shop-container shop-section">
      <div className="shop-section-head">
        <div>
          <span className="eyebrow">My account</span>
          <h1>Favorites</h1>
        </div>
      </div>

      {!favorites ? <p>Loading...</p> : favorites.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing saved yet</h3>
          <p>Tap the heart on a product to save it here.</p>
        </div>
      ) : (
        <div className="product-grid">
          {favorites.map((fav) => (
            <div key={fav.id} style={{ position: 'relative' }}>
              <ProductCard product={fav.product} />
              <button
                type="button"
                onClick={() => onRemove(fav.product.id)}
                className="btn-icon"
                aria-label="Remove from favorites"
                style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, background: 'rgba(255,255,255,0.9)' }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
