"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const LINKS = [
  { href: '/admin/shops', label: 'Shops' },
];

// Login has no session yet -- no nav chrome (or a logout button that would
// do nothing) makes sense here, mirroring portal/portal-nav.tsx.
const NO_NAV_PATHS = ['/admin/login'];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (NO_NAV_PATHS.includes(pathname)) return null;

  function onLogout() {
    window.localStorage.removeItem('shops_platform_admin_token');
    router.push('/admin/login');
  }

  return (
    <nav className="admin-nav">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={pathname.startsWith(link.href) ? 'is-active' : ''}>
          {link.label}
        </Link>
      ))}
      <div style={{ flex: 1 }} />
      <button type="button" className="admin-btn-ghost" style={{ textAlign: 'left', marginTop: 12 }} onClick={onLogout}>
        Log out
      </button>
    </nav>
  );
}
