import type { Metadata } from 'next';
import Link from 'next/link';
import { getCategories, getProducts, getShopInfo } from '@/app/lib/api';
import { ProductCard } from '@/app/product-card';
import { currentOrigin, OG_IMAGE_SIZE } from '@/app/lib/seo';
import { JsonLd } from '@/app/lib/structured-data';
import {
  buildCollections, collectionDescription, collectionFaqs, collectionHeading, collectionIntro, collectionPath, isIndexable,
  type Collection, type CollectionKind,
} from '@/app/lib/collections';

/** The shop's collections, rebuilt from the live catalogue on every request so prices and stock in the copy are current. */
async function load(kind: CollectionKind, slug: string) {
  const [products, shop] = await Promise.all([getProducts(), getShopInfo()]);
  const all = buildCollections(products);
  return { all, shop, collection: all.find((c) => c.kind === kind && c.slug === slug) };
}

/** Title, description, canonical and share card for a brand or model page. */
export async function collectionMetadata(kind: CollectionKind, slug: string): Promise<Metadata> {
  const { collection, shop } = await load(kind, slug);
  if (!collection) return { title: 'Not found', robots: { index: false, follow: true } };
  const origin = currentOrigin();
  const heading = collectionHeading(collection, shop);
  const description = collectionDescription(collection, shop);
  const canonical = `${origin}${collectionPath(collection)}`;
  const withImage = collection.products.find((p) => p.imageUrls[0]);
  const images = withImage
    ? [{ url: `${origin}/og/product/${withImage.slug}`, ...OG_IMAGE_SIZE, alt: collection.name, type: 'image/jpeg' }]
    : [];

  return {
    title: `${heading} | ${shop.name}`,
    description,
    alternates: { canonical },
    // A one- or two-product page is thin; it stays reachable (product pages link to it) but out of the index.
    ...(isIndexable(collection) ? {} : { robots: { index: false, follow: true } }),
    openGraph: { type: 'website', siteName: shop.name, title: `${heading} | ${shop.name}`, description, url: canonical, locale: 'en_KE', images },
  };
}

/**
 * The page itself: a plain, fully server-rendered answer (price range, where to buy, delivery) above the product grid,
 * with the questions shoppers ask below it, visible and marked up as FAQPage. Written for people first; it is also
 * the shape search engines and AI assistants quote from.
 */
export async function CollectionPage({ kind, slug }: { kind: CollectionKind; slug: string }) {
  const { all, shop, collection } = await load(kind, slug);
  if (!collection) return null;
  const origin = currentOrigin();
  const heading = collectionHeading(collection, shop);
  const faqs = collectionFaqs(collection, shop);
  const path = collectionPath(collection);
  const categories = await getCategories();
  const usedCategories = categories.filter((cat) => collection.products.some((p) => p.category?.slug === cat.slug));
  const others = all.filter((c) => isIndexable(c) && !(c.kind === collection.kind && c.slug === collection.slug)).slice(0, 12);

  return (
    <main>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: shop.name, item: origin },
            { '@type': 'ListItem', position: 2, name: heading, item: `${origin}${path}` },
          ],
        }}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          '@id': `${origin}${path}#collection`,
          name: heading,
          url: `${origin}${path}`,
          description: collectionDescription(collection, shop),
          isPartOf: { '@id': `${origin}/#website` },
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: collection.products.length,
            itemListElement: collection.products.slice(0, 50).map((product, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: `${origin}/shop/${product.slug}`,
              name: product.name,
            })),
          },
        }}
      />
      {/* Same words as the visible FAQ below: marked-up questions must match what the page shows. */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          '@id': `${origin}${path}#faq`,
          mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
        }}
      />

      <section className="shop-section">
        <div className="shop-container">
          <nav aria-label="Breadcrumb" style={{ fontSize: 'var(--shop-text-sm)', color: 'var(--shop-muted)', marginBottom: 'var(--shop-space-3)' }}>
            <Link href="/">{shop.name}</Link> / <span>{heading}</span>
          </nav>
          <div className="shop-section-head">
            <div>
              <h1>{heading}</h1>
              <p style={{ maxWidth: '70ch' }}>{collectionIntro(collection, shop)}</p>
              {collection.blurb ? <p style={{ maxWidth: '70ch' }}>{collection.blurb}</p> : null}
            </div>
          </div>
          <div className="product-grid" aria-label={`${collection.name} products`}>
            {collection.products.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        </div>
      </section>

      <section className="shop-section">
        <div className="shop-container">
          <h2>Frequently asked questions</h2>
          {faqs.map((faq) => (
            <div key={faq.question} style={{ marginTop: 'var(--shop-space-3)' }}>
              <h3>{faq.question}</h3>
              <p style={{ maxWidth: '70ch' }}>{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {others.length > 0 || usedCategories.length > 0 ? (
        <section className="shop-section">
          <div className="shop-container">
            <h2>Keep browsing</h2>
            <p style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--shop-space-3)' }}>
              {usedCategories.map((cat) => <Link key={cat.slug} href={`/?category=${cat.slug}`}>{cat.name}</Link>)}
              {others.map((other) => <Link key={`${other.kind}-${other.slug}`} href={collectionPath(other)}>{other.name}</Link>)}
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}

/** Whether a brand or model page exists for this slug; the route 404s when it does not. */
export async function collectionExists(kind: CollectionKind, slug: string): Promise<boolean> {
  return Boolean((await load(kind, slug)).collection);
}
export type { Collection };
