"use client";

import { useEffect, useState } from 'react';
import { useCustomerAuth } from './lib/customer-auth';
import { useCustomerFetch } from './lib/use-customer-fetch';

export function FavoriteButton({ productId }: { productId: string }) {
  const { customer, ready } = useCustomerAuth();
  const customerFetch = useCustomerFetch();
  const [isFavorite, setIsFavorite] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready || !customer) { setLoaded(true); return; }
    customerFetch('/account/favorites')
      .then((r) => r.json())
      .then((favorites: { product: { id: string } }[]) => {
        setIsFavorite(favorites.some((f) => f.product.id === productId));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, customer, productId]);

  async function toggle() {
    if (!customer) {
      window.location.href = '/account/login';
      return;
    }
    if (isFavorite) {
      await customerFetch(`/account/favorites/${productId}`, { method: 'DELETE' });
      setIsFavorite(false);
    } else {
      await customerFetch(`/account/favorites/${productId}`, { method: 'POST' });
      setIsFavorite(true);
    }
  }

  if (!loaded) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
      style={{
        background: '#fff',
        border: '1px solid var(--shop-line)',
        padding: '8px 14px',
        cursor: 'pointer',
        color: isFavorite ? 'var(--shop-accent)' : 'var(--shop-ink)',
      }}
    >
      {isFavorite ? '♥ Saved' : '♡ Save'}
    </button>
  );
}
