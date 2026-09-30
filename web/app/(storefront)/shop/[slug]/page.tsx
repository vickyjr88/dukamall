import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProduct, getShopInfo } from '@/app/lib/api';
import { currentOrigin } from '@/app/lib/seo';
import { ProductClient } from './product-client';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const [product, shopInfo] = await Promise.all([getProduct(params.slug), getShopInfo()]);
  if (!product) return {};
  const origin = currentOrigin();
  const description = product.description || `${product.name} at ${shopInfo.name}.`;
  return {
    title: `${product.name} | ${shopInfo.name}`,
    description,
    alternates: { canonical: `${origin}/shop/${product.slug}` },
    openGraph: {
      title: product.name,
      description,
      url: `${origin}/shop/${product.slug}`,
      images: product.imageUrls,
      type: 'website',
    },
  };
}

// Google's Product structured data -- price/availability/brand in a form
// search results can actually render (a price snippet, an "in stock"
// badge), not just crawlable body text. Built from the same fields the page
// itself already renders (ProductClient), so it can never drift out of
// sync with what a shopper actually sees.
function productJsonLd(product: NonNullable<Awaited<ReturnType<typeof getProduct>>>, shopInfo: { name: string; currency: string }, origin: string) {
  const cheapestVariant = product.variants.reduce((min, v) => (Number(v.priceKes) < Number(min.priceKes) ? v : min), product.variants[0]);
  const inStock = product.variants.some((v) => v.stockOnHand > 0);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || undefined,
    image: product.imageUrls,
    brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
    offers: cheapestVariant ? {
      '@type': 'Offer',
      url: `${origin}/shop/${product.slug}`,
      priceCurrency: shopInfo.currency,
      price: Number(cheapestVariant.priceKes),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: shopInfo.name },
    } : undefined,
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const [product, shopInfo] = await Promise.all([getProduct(params.slug), getShopInfo()]);
  if (!product) notFound();
  const jsonLd = productJsonLd(product, shopInfo, currentOrigin());
  return (
    <>
      {/* eslint-disable-next-line react/no-danger -- JSON-LD is the one case
          Next.js itself documents this pattern for; the object above is
          built entirely from this platform's own data, never user input. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ProductClient product={product} shopInfo={shopInfo} />
    </>
  );
}
