import type { Metadata } from 'next';
import { getCategories, getFilters, getProducts, getShopInfo, getTheme } from '@/app/lib/api';
import { currentOrigin, OG_IMAGE_SIZE } from '@/app/lib/seo';
import { StorefrontSearch } from './storefront-search';

// Every shop shared the root layout's generic "Shop" title until now --
// the actual point of this file: a shop's real name in the browser tab,
// search results, and link previews (WhatsApp/social), which is the single
// biggest SEO gap a multi-tenant storefront platform can have.
export async function generateMetadata(): Promise<Metadata> {
  const [shopInfo, theme] = await Promise.all([getShopInfo(), getTheme()]);
  const origin = currentOrigin();
  const description = `Shop ${shopInfo.name} -- new arrivals added regularly.`;
  return {
    title: shopInfo.name,
    description,
    alternates: { canonical: origin },
    openGraph: {
      type: 'website',
      siteName: shopInfo.name,
      title: shopInfo.name,
      description,
      url: origin,
      // /og/home serves the hero (or logo) resized to a small 1200x630 JPEG --
      // the raw upload was often several MB, which WhatsApp and others skip.
      images: theme.heroImageUrl || theme.logoUrl
        ? [{ url: `${origin}/og/home`, ...OG_IMAGE_SIZE, alt: shopInfo.name }]
        : [],
    },
  };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { category?: string; brand?: string; size?: string; search?: string; sort?: string; minPrice?: string; maxPrice?: string };
}) {
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

  return (
    <main>
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
          <span className="eyebrow">New arrivals</span>
          <h1>{shopInfo.name}</h1>
          <p>Shop the latest drop -- new pieces added regularly, while stock lasts.</p>
          <a href="#catalog" className="btn btn-primary">Shop now</a>
        </div>
      </section>

      <StorefrontSearch initialProducts={products} categories={categories} filters={filters} />
    </main>
  );
}
