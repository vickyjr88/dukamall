import { getTheme } from '@/app/lib/api';
import { ThemeInjector } from '@/app/theme-injector';
import { CartProvider } from '@/app/lib/cart';

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();

  return (
    <div data-layout={theme.layoutPreset}>
      <ThemeInjector theme={theme} />
      <CartProvider>
        <header className="shop-header">
          <a className="logo" href="/">
            {theme.logoUrl ? <img src={theme.logoUrl} alt="" /> : 'Shop'}
          </a>
          <a href="/cart">Cart</a>
        </header>
        {children}
      </CartProvider>
    </div>
  );
}
