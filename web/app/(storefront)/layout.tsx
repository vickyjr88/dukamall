import { headers } from 'next/headers';
import { getTheme } from '@/app/lib/api';
import { ThemeInjector } from '@/app/theme-injector';
import { CartProvider } from '@/app/lib/cart';
import { ShopIdProvider } from '@/app/lib/shop-id-context';
import { CustomerAuthProvider } from '@/app/lib/customer-auth';
import { StorefrontHeader } from './storefront-header';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  const shopId = headers().get('x-shop-id');

  return (
    <div data-layout={theme.layoutPreset}>
      <ThemeInjector theme={theme} />
      <ShopIdProvider shopId={shopId}>
        <CustomerAuthProvider>
          <CartProvider>
            <StorefrontHeader logoUrl={theme.logoUrl} />
            {children}
          </CartProvider>
        </CustomerAuthProvider>
      </ShopIdProvider>
    </div>
  );
}
