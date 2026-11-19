"use client";

import { usePathname } from 'next/navigation';
import './portal.css';
import { PortalNav, pageLabel } from './portal-nav';
import { Backdrop, CloseButton, TopBar, useDrawer } from '../mobile-drawer';
import { clearCachedRole, OWNER_ONLY_PATHS, OwnerOnlyNotice, PortalSessionProvider, useSession } from './portal-session';

// Login/signup render their own full-page .portal-auth-shell (see
// login/page.tsx) -- no session exists yet, so there's nothing for a
// sidebar to navigate to. Previously the sidebar (brand label, full width,
// dark background) rendered unconditionally here regardless of route, and
// only the *links inside* it were hidden by PortalNav -- so a signed-out
// visitor saw an empty sidebar column sitting next to the login card
// instead of no sidebar at all.
const NO_SIDEBAR_PATHS = ['/portal/login', '/portal/signup', '/portal/sso', '/portal/forgot-password', '/portal/reset-password'];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalSessionProvider>
      <PortalChrome>{children}</PortalChrome>
    </PortalSessionProvider>
  );
}

function PortalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, role, me } = useSession();
  const drawer = useDrawer(pathname);

  if (NO_SIDEBAR_PATHS.includes(pathname)) {
    return (
      <div className="portal-root">
        {children}
      </div>
    );
  }

  // A cashier who types or bookmarks an owner-only address gets an
  // explanation instead of a page whose every request would be refused.
  //
  // The page is not mounted at all until the role is known: an owner-only page
  // that mounted first would fire requests the API refuses (403) before this
  // gate had a chance to step in.
  const ownerOnly = OWNER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  let content: React.ReactNode = children;
  if (ownerOnly) {
    if (!ready) content = <p>Loading...</p>;
    else if (role === 'STAFF') content = <OwnerOnlyNotice what="open this page" />;
  }

  return (
    <div className="portal-root">
      <div className="portal-shell">
        <TopBar className="portal-topbar" brand="Shops Platform" title={pageLabel(pathname)} drawerId="portal-drawer" open={drawer.open} onOpen={() => drawer.setOpen(true)} openerRef={drawer.opener} />
        <Backdrop open={drawer.open} onClose={drawer.close} />
        {/* A tap on any link inside the drawer closes it, even a link to the page you are already on (which changes no path). */}
        <aside id="portal-drawer" className={`portal-sidebar${drawer.open ? ' is-open' : ''}`} onClick={(e) => { if ((e.target as HTMLElement).closest('a')) drawer.close(); }}>
          <div className="portal-sidebar-brand">Shops Platform<CloseButton onClose={drawer.close} closeRef={drawer.closer} /></div>
          <PortalNav />
        </aside>
        <main className="portal-content">
          {me?.impersonating ? (
            <div className="portal-alert is-warn" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span><strong>Platform support session.</strong> You&apos;re viewing this shop as its owner. It ends automatically after an hour, and password, profile and staff changes are turned off.</span>
              <button
                type="button"
                className="portal-btn-outline portal-btn portal-btn-sm"
                onClick={() => { window.localStorage.removeItem('shops_platform_token'); clearCachedRole(); window.location.href = '/portal/login'; }}
              >
                End session
              </button>
            </div>
          ) : null}
          {content}
        </main>
      </div>
    </div>
  );
}
