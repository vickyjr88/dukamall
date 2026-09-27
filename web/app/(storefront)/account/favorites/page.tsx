"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useCustomerFetch } from '@/app/lib/use-customer-fetch';

type Favorite = {
  id: string;
  product: { id: string; slug: string; name: string; imageUrls: string[]; variants: { priceKes: string }[] };
};

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
    <main className="shop-container">
      <h1>Favorites</h1>
      {!favorites ? <p>Loading...</p> : favorites.length === 0 ? (
        <p>Nothing saved yet -- tap the heart on a product to save it here.</p>
      ) : (
        <div className="product-grid">
          {favorites.map((fav) => (
            <div key={fav.id} className="product-card" style={{ position: 'relative' }}>
              <Link href={`/shop/${fav.product.slug}`}>
                {fav.product.imageUrls[0] ? (
                  <img src={fav.product.imageUrls[0]} alt={fav.product.name} />
                ) : (
                  <div style={{ aspectRatio: '4/5', background: '#eee' }} />
                )}
                <div className="body">
                  <div className="name">{fav.product.name}</div>
                  {fav.product.variants[0] ? (
                    <div className="price">KES {Number(fav.product.variants[0].priceKes).toLocaleString()}</div>
                  ) : null}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => onRemove(fav.product.id)}
                style={{ position: 'absolute', top: 8, right: 8, background: '#fff', border: '1px solid var(--shop-line)', cursor: 'pointer', padding: '4px 8px' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
