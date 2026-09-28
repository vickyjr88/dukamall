"use client";

import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/portal/dashboard', label: 'Dashboard' },
  { href: '/portal/orders', label: 'Orders' },
  { href: '/portal/products', label: 'Products' },
  { href: '/portal/theme', label: 'Theme' },
  { href: '/portal/domain', label: 'Domain' },
  { href: '/portal/settings', label: 'Settings' },
];

// Login/signup have no session yet -- no nav chrome (or a logout button
// that would do nothing) makes sense on either.
const NO_NAV_PATHS = ['/portal/login', '/portal/signup'];

export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (NO_NAV_PATHS.includes(pathname)) return null;

  function onLogout() {
    window.localStorage.removeItem('shops_platform_token');
    router.push('/portal/login');
  }

  return (
    <nav className="portal-nav">
      {LINKS.map((link) => (
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
