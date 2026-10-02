import { headers } from 'next/headers';
import Link from 'next/link';
import { getTheme, resolveShopIdForHost } from '@/app/lib/api';
import { ThemeInjector } from '@/app/theme-injector';
import { NotFoundView, StorefrontNotFoundView } from '@/app/not-found-content';

/**
 * Renders for any URL no route matches -- outside the storefront layout, so
 * it brings its own theme.
 *
 * Every 404 leads to the shop's PUBLIC pages (catalogue, categories, cart,
 * account), including a dead /portal or /admin URL. Those two paths skip
 * shop resolution in middleware.ts, so there is no x-shop-id for them; the
 * shop is looked up here from the Host instead. A visitor who mistypes a
 * portal URL on a shop's domain still lands on that shop's storefront, not
 * on more portal pages.
 *
 * A host that belongs to no shop (or a failed lookup) gets a bare page
 * rather than turning a 404 into a 500.
 */
export default async function NotFound() {
  const h = headers();
  const host = h.get('host');
  const shopId = h.get('x-shop-id') || (host ? await resolveShopIdForHost(host) : null);

  if (shopId) {
    try {
      const [theme, view] = await Promise.all([getTheme(shopId), StorefrontNotFoundView({ shopId })]);
      return (
        <div data-layout={theme.layoutPreset}>
          <ThemeInjector theme={theme} />
          {view}
        </div>
      );
    } catch {
      // Fall through to the bare page below.
    }
  }

  return (
    <main className="shop-container shop-section notfound">
      <section className="notfound-hero">
        <span className="eyebrow">Error 404</span>
        <h1>Page not found</h1>
        <p>This address doesn&apos;t lead anywhere.</p>
        <p style={{ marginTop: 'var(--shop-space-4)' }}>
          <Link href="/" className="btn btn-primary">Go to the homepage</Link>
        </p>
      </section>
    </main>
  );
}
