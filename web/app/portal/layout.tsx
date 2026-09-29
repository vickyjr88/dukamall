"use client";

import { usePathname } from 'next/navigation';
import './portal.css';
import { PortalNav } from './portal-nav';

// Login/signup render their own full-page .portal-auth-shell (see
// login/page.tsx) -- no session exists yet, so there's nothing for a
// sidebar to navigate to. Previously the sidebar (brand label, full width,
// dark background) rendered unconditionally here regardless of route, and
// only the *links inside* it were hidden by PortalNav -- so a signed-out
// visitor saw an empty sidebar column sitting next to the login card
// instead of no sidebar at all.
const NO_SIDEBAR_PATHS = ['/portal/login', '/portal/signup'];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (NO_SIDEBAR_PATHS.includes(pathname)) {
    return (
      <div className="portal-root">
        {children}
      </div>
    );
  }

  return (
    <div className="portal-root">
      <div className="portal-shell">
        <aside className="portal-sidebar">
          <div className="portal-sidebar-brand">Shops Platform</div>
          <PortalNav />
        </aside>
        <main className="portal-content">{children}</main>
      </div>
    </div>
  );
}
