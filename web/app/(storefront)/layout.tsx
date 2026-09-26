import { headers } from 'next/headers';
import { getTheme } from '@/app/lib/api';
import { ThemeInjector } from '@/app/theme-injector';
import { CartProvider } from '@/app/lib/cart';
import { ShopIdProvider } from '@/app/lib/shop-id-context';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  const shopId = headers().get('x-shop-id');

  return (
    <div data-layout={theme.layoutPreset}>
      <ThemeInjector theme={theme} />
      <ShopIdProvider shopId={shopId}>
        <CartProvider>
          <header className="shop-header">
            <a className="logo" href="/">
              {theme.logoUrl ? <img src={theme.logoUrl} alt="" /> : 'Shop'}
            </a>
            <a href="/cart">Cart</a>
          </header>
          {children}
        </CartProvider>
      </ShopIdProvider>
    </div>
  );
}
