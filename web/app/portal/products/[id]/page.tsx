"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '../../portal-api';
import { ProductForm } from '../product-form';
import { ApiProduct } from '../product-types';

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    setJustCreated(new URLSearchParams(window.location.search).has('created'));
    portalFetch(`/portal/products/${params.id}`)
      .then(async (res) => {
        if (res.status === 404) return setState('missing');
        if (!res.ok) return setState('failed');
        setProduct(await res.json());
        setState('ready');
      })
      .catch(() => setState('failed'));
  }, [params.id]);

  if (state === 'loading') return <p>Loading...</p>;
  if (state !== 'ready' || !product) {
    return (
      <div className="portal-empty">
        {state === 'missing' ? 'That product doesn’t exist.' : 'Could not load this product.'}{' '}
        <Link href="/portal/products">Back to all products</Link>
      </div>
    );
  }
  // key: switching between two products' edit screens must rebuild the form's state.
  return <ProductForm key={product.id} product={product} initialNotice={justCreated ? 'Product created.' : undefined} />;
}
