import type { Metadata } from 'next';
import { getCategories, getFilters, getProducts, getShopInfo, getTheme } from '@/app/lib/api';
import Link from 'next/link';
import { buildCollections, collectionPath, isIndexable } from '@/app/lib/collections';
import { currentOrigin, OG_IMAGE_SIZE } from '@/app/lib/seo';
import { homePreviewImageUrl } from '@/app/lib/home-preview';
import { JsonLd, organizationJsonLd, websiteJsonLd } from '@/app/lib/structured-data';
import { StorefrontSearch } from './storefront-search';
import { ProductCard } from '@/app/product-card';
import { stylePresetFor } from '@/app/lib/style-presets';

type HomeSearchParams = { category?: string; brand?: string; size?: string; search?: string; sort?: string; minPrice?: string; maxPrice?: string };

// Anything beyond a plain category (brand, size, search, sort, price) is a view of the same
// products, not a new page: kept out of the index so search engines don't crawl endless combinations.
const FILTER_KEYS = ['brand', 'size', 'search', 'sort', 'minPrice', 'maxPrice'] as const;

const isFilteredView = (sp: HomeSearchParams) => Object.values(sp).some(Boolean);

function joinNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0] ?? '';
}

// Every shop shared the root layout's generic "Shop" title until now --
// the actual point of this file: a shop's real name in the browser tab,
// search results, and link previews (WhatsApp/social), which is the single
// biggest SEO gap a multi-tenant storefront platform can have.
export async function generateMetadata({ searchParams }: { searchParams: HomeSearchParams }): Promise<Metadata> {
  const [shopInfo, theme, categories] = await Promise.all([getShopInfo(), getTheme(), getCategories()]);
  const origin = currentOrigin();
  const previewImage = await homePreviewImageUrl(theme);
  const shopDescription = shopInfo.seoDescription || `Shop ${shopInfo.name} -- new arrivals added regularly.`;

  // A category view is its own page with its own title, description and address; the plain
  // home page names what the shop sells ("Nairobi Gents | Sneakers, Casuals & Officials").
  const category = searchParams.category ? categories.find((c) => c.slug === searchParams.category) : undefined;
  const filtered = FILTER_KEYS.some((key) => searchParams[key]);
  const canonical = category ? `${origin}/?category=${category.slug}` : origin;
  const title = category
    ? `${category.name} | ${shopInfo.name}`
    : categories.length
      ? `${shopInfo.name} | ${joinNames(categories.slice(0, 3).map((c) => c.name))}`
      : shopInfo.name;
  const description = category
    ? `Shop ${category.name.toLowerCase()} at ${shopInfo.name}. ${shopInfo.seoDescription || 'New arrivals added regularly.'}`
    : shopDescription;

  return {
    title,
    description,
    alternates: { canonical },
    // An unknown category or a filtered view must not compete with the page it filters.
    ...((filtered || (searchParams.category && !category)) ? { robots: { index: false, follow: true } } : {}),
    // Search Console's "HTML tag" verification: <meta name="google-site-verification">, on the home page.
    ...(shopInfo.searchConsoleVerification ? { verification: { google: shopInfo.searchConsoleVerification } } : {}),
    openGraph: {
      type: 'website',
      siteName: shopInfo.name,
      title,
      description,
      url: canonical,
      // /og/home serves the hero (or logo) resized to a small 1200x630 JPEG --
      // the raw upload was often several MB, which WhatsApp and others skip.
      locale: 'en_KE',
      images: previewImage
        ? [{ url: `${origin}/og/home`, ...OG_IMAGE_SIZE, alt: shopInfo.name, type: 'image/jpeg' }]
        : [],
    },
  };
}

export default async function HomePage({ searchParams }: { searchParams: HomeSearchParams }) {
  const query = {
    category: searchParams.category,
    brand: searchParams.brand,
    size: searchParams.size,
    search: searchParams.search,
    sort: searchParams.sort,
    minPrice: searchParams.minPrice,
    maxPrice: searchParams.maxPrice,
  };

  const [products, shopInfo, theme, categories, filters] = await Promise.all([
    getProducts(query),
    getShopInfo(),
    getTheme(),
    getCategories(),
    getFilters(),
  ]);

  const luxe = stylePresetFor(theme.stylePreset).luxe;
  const origin = currentOrigin();
  // The biggest brand and model pages, from the unfiltered catalogue (the query above may be a search or a category).
  const popular = isFilteredView(searchParams)
    ? []
    : buildCollections(products).filter(isIndexable).sort((a, b) => b.products.length - a.products.length).slice(0, 10);
  // On a category view the page's own heading is the category, not the shop-wide hero line.
  const category = searchParams.category ? categories.find((c) => c.slug === searchParams.category) : undefined;
  const headline = category ? category.name : theme.heroHeadline || shopInfo.name;
  const subtitle = category
    ? `Browse ${category.name.toLowerCase()} at ${shopInfo.name}.`
    : theme.heroSubtitle || 'Shop the latest drop -- new pieces added regularly, while stock lasts.';

  // The luxury styles open the plain home page as an editorial landing; a category or filtered view stays a clean, compact listing.
  const landing = luxe && !category && !isFilteredView(searchParams);
  const tiles = landing
    ? categories
        .map((c) => {
          const inCategory = products.filter((p) => p.category?.slug === c.slug);
          return { category: c, count: inCategory.length, image: inCategory.find((p) => p.imageUrls[0])?.imageUrls[0] ?? null };
        })
        .filter((t) => t.image)
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
    : [];
  const freeOver = shopInfo.freeDeliveryOverKes ? Number(shopInfo.freeDeliveryOverKes) : 0;
  const deliveryFee = shopInfo.deliveryFeeKes ? Number(shopInfo.deliveryFeeKes) : 0;
  const pillars = [
    freeOver > 0
      ? { title: 'Delivery', text: `Complimentary on orders over KES ${freeOver.toLocaleString()}` }
      : deliveryFee > 0 ? { title: 'Delivery', text: `To your door from KES ${deliveryFee.toLocaleString()}` } : null,
    shopInfo.whatsappNumber ? { title: 'Concierge', text: 'Personal help with sizing and styling on WhatsApp' } : null,
    { title: 'Secure checkout', text: 'Pay safely online, your order confirmed at once' },
  ].filter((p): p is { title: string; text: string } => Boolean(p));

  return (
    <main>
      {category ? null : <JsonLd data={organizationJsonLd(shopInfo, theme, origin)} />}
      {category ? null : <JsonLd data={websiteJsonLd(shopInfo, origin)} />}
      {luxe ? (
        landing ? (
          <section className={`shop-hero lux-hero${theme.heroImageUrl ? ' has-media' : ''}`}>
            {theme.heroImageUrl ? (
              <div className="shop-hero-media">
                <img src={theme.heroImageUrl} alt="" />
              </div>
            ) : null}
            <div className="shop-hero-content">
              <span className="eyebrow">{theme.heroEyebrow || 'New arrivals'}</span>
              <h1>{headline}</h1>
              <p>{subtitle}</p>
              <div className="lux-hero-actions">
                <a href="#new" className="btn btn-primary">{theme.heroButtonLabel || 'Discover the collection'}</a>
              </div>
            </div>
          </section>
        ) : (
          <section className="shop-section" style={{ paddingBottom: 0 }}>
            <div className="shop-container">
              <span className="eyebrow">{category ? 'Collection' : 'Search'}</span>
              <h1 style={{ marginTop: 14 }}>{category ? category.name : searchParams.search ? `\u201C${searchParams.search}\u201D` : 'The collection'}</h1>
            </div>
          </section>
        )
      ) : (
      <section className={`shop-hero${theme.heroImageUrl ? ' has-media' : ''}`}>
        {theme.heroImageUrl ? (
          <div className="shop-hero-media">
            {/* Plain <img>, not next/image: the hero photo is merchant-
                uploaded via the portal (arbitrary external URL, not a
                platform asset with known dimensions), and this section
                already has its own object-fit:cover + overlay handling
                (see globals.css) mirroring what next/image would add. */}
            <img src={theme.heroImageUrl} alt="" />
          </div>
        ) : null}
        <div className="shop-hero-content">
          <span className="eyebrow">{theme.heroEyebrow || 'New arrivals'}</span>
          <h1>{headline}</h1>
          <p>{subtitle}</p>
          <a href="#catalog" className="btn btn-primary">{theme.heroButtonLabel || 'Shop now'}</a>
        </div>
      </section>
      )}

      {landing && tiles.length >= 2 ? (
        <section className="shop-section" aria-label="Shop by category">
          <div className="shop-container">
            <div className="lux-head">
              <div><span className="eyebrow">The edit</span><h2>Shop by category</h2></div>
            </div>
            <div className="lux-cats" data-count={tiles.length} style={{ ['--cols' as string]: tiles.length }}>
              {tiles.map((t) => (
                <Link key={t.category.slug} href={`/?category=${t.category.slug}#catalog`} className="lux-cat">
                  <img src={t.image as string} alt="" loading="lazy" />
                  <span className="lux-cat-label"><strong>{t.category.name}</strong><span>Shop now</span></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {landing && products.length >= 4 ? (
        <section className="shop-section" id="new" aria-label="New arrivals" style={{ paddingTop: 0 }}>
          <div className="shop-container">
            <div className="lux-head">
              <div><span className="eyebrow">Just in</span><h2>New arrivals</h2></div>
              <Link href="/#catalog" className="lux-link">View all</Link>
            </div>
            <div className="product-grid">
              {products.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          </div>
        </section>
      ) : null}

      {landing && pillars.length > 0 ? (
        <section className="lux-pillars" aria-label="Our promise">
          <div className="shop-container">
            <div className="lux-pillars-grid">
              {pillars.map((p) => <div key={p.title} className="lux-pillar"><strong>{p.title}</strong><span>{p.text}</span></div>)}
            </div>
          </div>
        </section>
      ) : null}

      <StorefrontSearch initialProducts={products} categories={categories} filters={filters} />

      {/* Plain links to the brand and model pages: how shoppers (and crawlers) find them from the home page. */}
      {popular.length > 0 ? (
        <section className="shop-section" aria-label="Shop by brand">
          <div className="shop-container">
            <div className="shop-section-head"><div><span className="eyebrow">Shop by brand</span></div></div>
            <p style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--shop-space-3)' }}>
              {popular.map((c) => <Link key={`${c.kind}-${c.slug}`} href={collectionPath(c)}>{c.name}</Link>)}
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
