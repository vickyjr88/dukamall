import type { Metadata } from 'next';
import { getCategories, getFilters, getProducts, getShopInfo, getTheme } from '@/app/lib/api';
import { currentOrigin, OG_IMAGE_SIZE } from '@/app/lib/seo';
import { homePreviewImageUrl } from '@/app/lib/home-preview';
import { JsonLd, organizationJsonLd, websiteJsonLd } from '@/app/lib/structured-data';
import { StorefrontSearch } from './storefront-search';

type HomeSearchParams = { category?: string; brand?: string; size?: string; search?: string; sort?: string; minPrice?: string; maxPrice?: string };

// Anything beyond a plain category (brand, size, search, sort, price) is a view of the same
// products, not a new page: kept out of the index so search engines don't crawl endless combinations.
const FILTER_KEYS = ['brand', 'size', 'search', 'sort', 'minPrice', 'maxPrice'] as const;

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

  const origin = currentOrigin();
  // On a category view the page's own heading is the category, not the shop-wide hero line.
  const category = searchParams.category ? categories.find((c) => c.slug === searchParams.category) : undefined;
  const headline = category ? category.name : theme.heroHeadline || shopInfo.name;
  const subtitle = category
    ? `Browse ${category.name.toLowerCase()} at ${shopInfo.name}.`
    : theme.heroSubtitle || 'Shop the latest drop -- new pieces added regularly, while stock lasts.';

  return (
    <main>
      {category ? null : <JsonLd data={organizationJsonLd(shopInfo, theme, origin)} />}
      {category ? null : <JsonLd data={websiteJsonLd(shopInfo, origin)} />}
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

      <StorefrontSearch initialProducts={products} categories={categories} filters={filters} />
    </main>
  );
}
