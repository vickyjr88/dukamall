import { notFound } from 'next/navigation';
import { getProduct, getShopInfo } from '@/app/lib/api';
import { ProductClient } from './product-client';

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const [product, shopInfo] = await Promise.all([getProduct(params.slug), getShopInfo()]);
  if (!product) notFound();
  return <ProductClient product={product} shopInfo={shopInfo} />;
}
