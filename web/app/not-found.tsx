import { headers } from 'next/headers';
import Link from 'next/link';
import { getShopInfo, getTheme } from '@/app/lib/api';
import { ThemeInjector } from '@/app/theme-injector';
import { NotFoundContent } from '@/app/not-found-content';

/**
 * Renders for any URL no route matches. That happens OUTSIDE the storefront
 * layout (which is what applies the shop's theme), so this has to bring its
 * own theme: middleware.ts sets x-shop-id for storefront requests, and with
 * it this loads the shop's theme and name the same way the layout does.
 *
 * /portal and /admin skip shop resolution entirely (see middleware.ts), so
 * there is no shop to theme a 404 for there -- and a failed lookup falls
 * back to the same plain page rather than turning a 404 into a 500.
 */
export default async function NotFound() {
  if (headers().get('x-shop-id')) {
    try {
      const [theme, shopInfo] = await Promise.all([getTheme(), getShopInfo()]);
      return (
        <div data-layout={theme.layoutPreset}>
          <ThemeInjector theme={theme} />
          <NotFoundContent shopName={shopInfo.name} whatsappNumber={shopInfo.whatsappNumber} />
        </div>
      );
    } catch {
      // Fall through to the plain page below.
    }
  }

  return (
    <main className="shop-container shop-section" style={{ textAlign: 'center', maxWidth: 560 }}>
      <span className="eyebrow">404</span>
      <h1 style={{ marginBottom: 'var(--shop-space-3)' }}>Page not found</h1>
      <p style={{ color: 'var(--shop-muted)', marginBottom: 'var(--shop-space-6)' }}>
        This page doesn&apos;t exist, or the address was mistyped.
      </p>
      <div style={{ display: 'flex', gap: 'var(--shop-space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/portal/dashboard" className="btn btn-primary">Merchant portal</Link>
        <Link href="/admin/shops" className="btn btn-outline">Admin console</Link>
      </div>
    </main>
  );
}
