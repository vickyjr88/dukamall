import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTheme, getShopInfo, getPages, getCategories } from '@/app/lib/api';
import { ThemeInjector } from '@/app/theme-injector';
import { CartProvider } from '@/app/lib/cart';
import { ShopIdProvider } from '@/app/lib/shop-id-context';
import { ShopInfoProvider } from '@/app/lib/shop-info-context';
import { CustomerAuthProvider } from '@/app/lib/customer-auth';
import { WhatsAppFloat } from '@/app/whatsapp-float';
import { GoogleAnalytics } from '@/app/lib/google-analytics';
import { AdPixels } from '@/app/lib/ad-pixels';
import { StorefrontTracker } from '@/app/lib/storefront-tracker';
import { StorefrontHeader } from './storefront-header';
import { StorefrontFooter } from './storefront-footer';
import { StyleProvider } from '@/app/lib/style-context';
import { stylePresetFor } from '@/app/lib/style-presets';

// The shop's own icon (its logo, or a letter tile) -- see app/icon/route.tsx.
export const metadata: Metadata = {
  icons: { icon: [{ url: '/icon', type: 'image/png', sizes: '192x192' }], apple: '/icon' },
};

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const [theme, shopInfo, pages, categories] = await Promise.all([getTheme(), getShopInfo(), getPages(), getCategories()]);
  const shopId = headers().get('x-shop-id');
  const style = stylePresetFor(theme.stylePreset);

  return (
    <div
      data-layout={theme.layoutPreset}
      data-style={style.key}
      {...(style.luxe ? { 'data-luxe': '' } : {})}
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      <ThemeInjector theme={theme} />
      <StyleProvider preset={style.key} luxe={style.luxe}>
      <GoogleAnalytics measurementId={shopInfo.ga4MeasurementId} />
      <AdPixels metaPixelId={shopInfo.metaPixelId} tiktokPixelId={shopInfo.tiktokPixelId} xPixelId={shopInfo.xPixelId} />
      <ShopIdProvider shopId={shopId}>
        <ShopInfoProvider shopInfo={shopInfo}>
          <CustomerAuthProvider>
            <CartProvider>
              <StorefrontTracker />
              {shopInfo.announcement ? <div className="shop-announcement">{shopInfo.announcement}</div> : null}
              <StorefrontHeader shopName={shopInfo.name} logoUrl={theme.logoUrl} categories={categories} />
              <div style={{ flex: 1 }}>{children}</div>
              <StorefrontFooter shopInfo={shopInfo} pages={pages} />
              <WhatsAppFloat />
            </CartProvider>
          </CustomerAuthProvider>
        </ShopInfoProvider>
      </ShopIdProvider>
      </StyleProvider>
    </div>
  );
}
