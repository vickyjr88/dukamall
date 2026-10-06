import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProduct, getShopInfo } from '@/app/lib/api';
import { currentOrigin, OG_IMAGE_SIZE, truncate } from '@/app/lib/seo';
import { ProductClient } from './product-client';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const [product, shopInfo] = await Promise.all([getProduct(params.slug), getShopInfo()]);
  if (!product) return {};
  const origin = currentOrigin();
  const url = `${origin}/shop/${product.slug}`;

  // Price up front: in a chat preview the title and the first line of the
  // description are all that shows, and "how much" is what people ask.
  const prices = product.variants.map((v) => Number(v.priceKes)).filter((n) => n > 0);
  const priceLine = prices.length ? `${shopInfo.currency} ${Math.min(...prices).toLocaleString('en-US')}` : '';
  const body = truncate(product.description || `${product.name} at ${shopInfo.name}.`, 160);
  const description = priceLine ? `${priceLine} - ${body}` : body;

  return {
    title: `${product.name} | ${shopInfo.name}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: shopInfo.name,
      title: priceLine ? `${product.name} - ${priceLine}` : product.name,
      description,
      url,
      // /og/product/<slug> serves the first photo recomposed to a small 1200x630
      // JPEG (see app/lib/og-image.ts) rather than the raw, often portrait,
      // multi-hundred-KB upload.
      images: product.imageUrls?.[0]
        ? [{ url: `${origin}/og/product/${product.slug}`, ...OG_IMAGE_SIZE, alt: product.name }]
        : [],
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
