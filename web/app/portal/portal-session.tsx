"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { portalFetch } from './portal-api';

export type PortalRole = 'OWNER' | 'STAFF';
export type PortalMe = { id: string; email: string; firstName: string; lastName: string; shopId: string; role: PortalRole; /** True on a platform admin's "view as shop" session. */ impersonating?: boolean };

const ROLE_KEY = 'shops_platform_role';

/**
 * Pages only an owner may use. The API enforces the same limits regardless
 * (RolesGuard); this is what keeps a cashier from being shown screens and
 * buttons that would only fail. Keep in step with the @Roles('OWNER') routes
 * in the backend.
 */
export const OWNER_ONLY_PATHS = ['/portal/analytics', '/portal/discounts', '/portal/theme', '/portal/storefront', '/portal/pages', '/portal/domain'];

type Session = { me: PortalMe | null; role: PortalRole | null; isOwner: boolean; ready: boolean; refresh: () => void };
const SessionContext = createContext<Session>({ me: null, role: null, isOwner: false, ready: false, refresh: () => {} });

/**
 * Who is logged in and what they may do, from GET /auth/me (a live read of
 * their role in this shop). The last known role is cached in localStorage so
 * the menu doesn't flicker on every page load for an owner -- it is only a
 * rendering hint and is replaced by the real answer as soon as it arrives.
 */
export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<PortalMe | null>(null);
  const [role, setRole] = useState<PortalRole | null>(null);
  const [ready, setReady] = useState(false);
  // Re-checked on every navigation, not just on first load: logging in is a
  // client-side navigation that never remounts this provider, so a one-time
  // fetch would leave the role unknown right after login. It also keeps the
  // role current if the owner changes it mid-session.
  const pathname = usePathname();
  // Bumped by refresh() so a page that changed the user's own details (the profile page) can re-read them.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const token = window.localStorage.getItem('shops_platform_token');
    const cached = window.localStorage.getItem(ROLE_KEY);
    if (cached === 'OWNER' || cached === 'STAFF') setRole(cached);
    if (!token) { setReady(true); return; }

    portalFetch('/auth/me')
      .then(async (res) => {
        if (!res.ok) { window.localStorage.removeItem(ROLE_KEY); setRole(null); return; }
        const data: PortalMe = await res.json();
        setMe(data);
        setRole(data.role);
        window.localStorage.setItem(ROLE_KEY, data.role);
      })
      .catch(() => { /* offline: keep the cached hint */ })
      .finally(() => setReady(true));
  }, [pathname, version]);

  return <SessionContext.Provider value={{ me, role, isOwner: role === 'OWNER', ready, refresh: () => setVersion((v) => v + 1) }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}

export function clearCachedRole() {
  window.localStorage.removeItem(ROLE_KEY);
}

/** Shown in place of an owner-only screen or card when a cashier lands on it. */
export function OwnerOnlyNotice({ what }: { what: string }) {
  return (
    <div className="portal-empty">
      <strong>Only the shop owner can {what}.</strong>
      <p style={{ marginTop: 6, fontSize: 13 }}>Ask the owner if you need something changed.</p>
    </div>
  );
}
