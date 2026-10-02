import Link from 'next/link';
import { getCategories, getShopInfo } from '@/app/lib/api';

/**
 * Shared body of every 404 page. A 404 is usually reached by someone who
 * wanted something specific -- a size that sold out and was delisted, a
 * mistyped URL, a stale link -- so this is a set of routes onward rather
 * than an apology: cards for the main parts of the site, most likely
 * destination first. Next serves it with HTTP 404 (and noindex) itself, so
 * it is never indexed as real content.
 *
 * Rendered from two places: app/not-found.tsx (a URL no route matches,
 * outside the storefront layout) and app/(storefront)/not-found.tsx (a page
 * that called notFound(), e.g. an unknown product slug, inside it).
 */

export type Destination = { href: string; title: string; body: string };

export function NotFoundView({
  title, lede, destinations, footnote,
}: {
  title: string;
  lede: string;
  destinations: Destination[];
  footnote?: { text: string; href: string; linkText: string };
}) {
  return (
    <main className="shop-container shop-section notfound">
      <section className="notfound-hero">
        <span className="eyebrow">Error 404</span>
        <h1>{title}</h1>
        <p>{lede}</p>
      </section>

      <section className="notfound-grid" aria-label="Where to go next">
        {destinations.map((d) => (
          <Link key={d.href} href={d.href} className="notfound-card">
            <h2>{d.title}</h2>
            <p>{d.body}</p>
            <span className="notfound-card-cue" aria-hidden>&rarr;</span>
          </Link>
        ))}
      </section>

      {footnote ? (
        <p className="notfound-footnote">
          {footnote.text} <a href={footnote.href} target={footnote.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{footnote.linkText}</a>
        </p>
      ) : null}
    </main>
  );
}

/**
 * The shop's own 404: its real categories (up to three -- more would bury
 * the other cards), the cart, the account pages (orders and favourites), and
 * WhatsApp when the shop has a number. Nothing here links to a page that doesn't exist: the
 * storefront has no About/Contact pages, so "talk to us" is WhatsApp.
 */
export async function StorefrontNotFoundView() {
  const [shopInfo, categories] = await Promise.all([getShopInfo(), getCategories()]);
  const digits = (shopInfo.whatsappNumber || '').replace(/[^\d]/g, '');

  const destinations: Destination[] = [
    { href: '/#catalog', title: 'Shop all', body: `Everything in ${shopInfo.name}, newest arrivals first.` },
    ...categories.slice(0, 3).map((c) => ({
      href: `/?category=${encodeURIComponent(c.slug)}#catalog`,
      title: c.name,
      body: `Browse ${c.name.toLowerCase()} at ${shopInfo.name}.`,
    })),
    { href: '/cart', title: 'Your cart', body: 'Pick up where you left off if you were mid checkout.' },
    { href: '/account/orders', title: 'Your orders', body: 'Sign in to track an order or see what is on its way.' },
    { href: '/account/favorites', title: 'Your favourites', body: 'The pieces you saved for later, all in one place.' },
  ];

  return (
    <NotFoundView
      title="We couldn't find that page"
      lede="The link may be out of date, or the item may have sold out and been taken down. Here is where most people go next."
      destinations={destinations}
      footnote={digits ? {
        text: "Can't find what you need?",
        href: `https://wa.me/${digits}`,
        linkText: 'Message us on WhatsApp and we will point you to it.',
      } : undefined}
    />
  );
}

// The portal and admin console resolve no shop (see middleware.ts), so a
// dead URL there can't be themed -- but it can still lead somewhere useful
// instead of only back to a login screen.
export const PORTAL_DESTINATIONS: Destination[] = [
  { href: '/portal/dashboard', title: 'Dashboard', body: 'Sales, recent orders and what is running low.' },
  { href: '/portal/orders', title: 'Orders', body: 'Find an order, update its status, notify the customer.' },
  { href: '/portal/products', title: 'Products', body: 'Prices, stock and what is on the shelf.' },
  { href: '/portal/analytics', title: 'Analytics', body: 'Revenue trends, best sellers and where customers come from.' },
  { href: '/portal/customers', title: 'Customers', body: 'Who is buying, and how often they come back.' },
  { href: '/portal/settings', title: 'Settings', body: 'WhatsApp, payments, staff and your password.' },
];

export const ADMIN_DESTINATIONS: Destination[] = [
  { href: '/admin/shops', title: 'Shops', body: 'Every shop on the platform, with status and billing.' },
  { href: '/admin/analytics', title: 'Analytics', body: 'Platform revenue, the shop leaderboard and churn.' },
  { href: '/admin/leads', title: 'Leads', body: 'WhatsApp orders and abandoned carts across all shops.' },
  { href: '/admin/search', title: 'Search', body: 'Find which shop a product or SKU belongs to.' },
  { href: '/admin/users', title: 'Users', body: 'Find a person and manage platform admin access.' },
  { href: '/admin/settings', title: 'Settings', body: 'System email and other platform-wide settings.' },
];
