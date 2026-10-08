import { headers } from 'next/headers';
import { getTheme, getShopInfo, getPages } from '@/app/lib/api';
import { ThemeInjector } from '@/app/theme-injector';
import { CartProvider } from '@/app/lib/cart';
import { ShopIdProvider } from '@/app/lib/shop-id-context';
import { ShopInfoProvider } from '@/app/lib/shop-info-context';
import { CustomerAuthProvider } from '@/app/lib/customer-auth';
import { WhatsAppFloat } from '@/app/whatsapp-float';
import { StorefrontHeader } from './storefront-header';
import { StorefrontFooter } from './storefront-footer';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const [theme, shopInfo, pages] = await Promise.all([getTheme(), getShopInfo(), getPages()]);
  const shopId = headers().get('x-shop-id');

  return (
    <div data-layout={theme.layoutPreset} style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ThemeInjector theme={theme} />
      <ShopIdProvider shopId={shopId}>
        <ShopInfoProvider shopInfo={shopInfo}>
          <CustomerAuthProvider>
            <CartProvider>
              {shopInfo.announcement ? <div className="shop-announcement">{shopInfo.announcement}</div> : null}
              <StorefrontHeader shopName={shopInfo.name} logoUrl={theme.logoUrl} />
              <div style={{ flex: 1 }}>{children}</div>
              <StorefrontFooter shopInfo={shopInfo} pages={pages} />
              <WhatsAppFloat />
            </CartProvider>
          </CustomerAuthProvider>
        </ShopInfoProvider>
      </ShopIdProvider>
    </div>
  );
}
