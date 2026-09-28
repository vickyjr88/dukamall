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
      className={`btn-icon${isFavorite ? ' is-active' : ''}`}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
        <path d="M12 21s-7.5-4.6-10-9.3C.6 8.1 2 4.5 5.6 4c2.2-.3 4.2.9 6.4 3 2.2-2.1 4.2-3.3 6.4-3 3.6.5 5 4.1 3.6 7.7C19.5 16.4 12 21 12 21z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
