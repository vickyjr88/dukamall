import { notFound } from 'next/navigation';
import { getProduct } from '@/app/lib/api';
import { ProductClient } from './product-client';

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getProduct(params.slug);
  if (!product) notFound();
  return <ProductClient product={product} />;
}
