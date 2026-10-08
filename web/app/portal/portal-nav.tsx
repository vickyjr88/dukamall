"use client";

import { usePathname, useRouter } from 'next/navigation';
import { clearCachedRole, OWNER_ONLY_PATHS, useSession } from './portal-session';

const LINKS = [
  { href: '/portal/dashboard', label: 'Dashboard' },
  { href: '/portal/analytics', label: 'Analytics' },
  { href: '/portal/orders', label: 'Orders' },
  { href: '/portal/products', label: 'Products' },
  { href: '/portal/categories', label: 'Categories' },
  { href: '/portal/discounts', label: 'Discounts' },
  { href: '/portal/customers', label: 'Customers' },
  { href: '/portal/leads', label: 'Leads' },
  { href: '/portal/theme', label: 'Theme' },
  { href: '/portal/domain', label: 'Domain' },
  { href: '/portal/settings', label: 'Settings' },
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
      {LINKS.filter((link) => role !== 'STAFF' || !OWNER_ONLY_PATHS.includes(link.href)).map((link) => (
        <a key={link.href} href={link.href} className={pathname.startsWith(link.href) ? 'is-active' : ''}>
          {link.label}
        </a>
      ))}
      <div style={{ flex: 1 }} />
      <button type="button" onClick={onLogout} className="portal-btn-ghost" style={{ textAlign: 'left', marginTop: 12 }}>
        Log out
      </button>
    </nav>
  );
}
