"use client";

import { usePathname, useRouter } from 'next/navigation';
import { clearCachedRole, OWNER_ONLY_PATHS, useSession } from './portal-session';

// Grouped by what a shop owner is doing, not by the order the screens were built in: 23 flat links were a list to read, not a menu to use.
const GROUPS: { label?: string; links: { href: string; label: string }[] }[] = [
  { links: [{ href: '/portal/dashboard', label: 'Dashboard' }] },
  {
    label: 'Sell',
    links: [
      { href: '/portal/orders', label: 'Orders' },
      { href: '/portal/leads', label: 'Leads' },
      { href: '/portal/customers', label: 'Customers' },
      { href: '/portal/discounts', label: 'Discounts' },
    ],
  },
  {
    label: 'Catalogue',
    links: [
      { href: '/portal/products', label: 'Products' },
      { href: '/portal/categories', label: 'Categories' },
      { href: '/portal/sections', label: 'What you sell' },
      { href: '/portal/media', label: 'Media' },
      { href: '/portal/catalog-health', label: 'Catalog check' },
    ],
  },
  {
    label: 'Marketing',
    links: [
      { href: '/portal/marketing', label: 'Overview' },
      { href: '/portal/status-kit', label: 'WhatsApp Status' },
      { href: '/portal/share', label: 'Share & QR' },
      { href: '/portal/whatsapp', label: 'WhatsApp' },
      { href: '/portal/facebook', label: 'Facebook' },
      { href: '/portal/social', label: 'Social posting' },
    ],
  },
  {
    label: 'Insights',
    links: [
      { href: '/portal/analytics', label: 'Analytics' },
      { href: '/portal/daily-report', label: 'Daily report' },
    ],
  },
  {
    label: 'Your shop',
    links: [
      { href: '/portal/theme', label: 'Theme' },
      { href: '/portal/storefront', label: 'Store info' },
      { href: '/portal/pages', label: 'Pages' },
      { href: '/portal/domain', label: 'Domain' },
      { href: '/portal/integrations', label: 'Connections' },
      { href: '/portal/settings', label: 'Settings' },
      { href: '/portal/profile', label: 'My profile' },
    ],
  },
];

// Login/signup have no session yet -- no nav chrome (or a logout button
// that would do nothing) makes sense on either. /portal/sso is a one-hop
// redirect landing (see its own page.tsx) with the same reasoning.
const NO_NAV_PATHS = ['/portal/login', '/portal/signup', '/portal/sso', '/portal/forgot-password', '/portal/reset-password'];

export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useSession();

  if (NO_NAV_PATHS.includes(pathname)) return null;

  function onLogout() {
    window.localStorage.removeItem('shops_platform_token');
    clearCachedRole();
    router.push('/portal/login');
  }

  return (
    <nav className="portal-nav">
      {GROUPS.map((group, gi) => {
        const links = group.links.filter((link) => role !== 'STAFF' || !OWNER_ONLY_PATHS.includes(link.href));
        if (!links.length) return null;
        return (
          <div key={group.label ?? gi} className="portal-nav-group">
            {group.label ? <div className="portal-nav-label">{group.label}</div> : null}
            {links.map((link) => (
              <a key={link.href} href={link.href} className={pathname === link.href || pathname.startsWith(`${link.href}/`) ? 'is-active' : ''}>{link.label}</a>
            ))}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <button type="button" onClick={onLogout} className="portal-btn-ghost" style={{ textAlign: 'left', marginTop: 12 }}>
        Log out
      </button>
    </nav>
  );
}
