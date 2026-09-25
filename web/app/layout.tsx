import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Powered by the Dubai Merchants Shops Platform',
};

// Deliberately theme-agnostic and shop-agnostic: this wraps BOTH the
// storefront (app/(storefront)/layout.tsx applies the shop's theme) and the
// portal admin (app/portal/*, which has no shop domain to resolve a theme
// from until after a staff member logs in). Keeping this minimal is what
// lets /portal render without needing an x-shop-id at all.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
