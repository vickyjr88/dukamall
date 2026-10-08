"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './admin.css';
import { AdminNav } from './admin-nav';
import { adminFetch } from './admin-api';

// Login renders its own full-page .admin-auth-shell (see login/page.tsx)
// -- no session exists yet, so there's nothing for a sidebar to navigate
// to. Previously the sidebar rendered unconditionally regardless of route,
// leaving an empty sidebar column beside the login card for a signed-out
// visitor -- same bug fixed the same way in portal/layout.tsx.
const NO_SIDEBAR_PATHS = ['/admin/login', '/admin/forgot-password', '/admin/reset-password'];

type TwoFactor = { available: boolean; enabled: boolean };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Whether two-factor sign-in exists on this platform at all (a server switch,
  // off by default) and whether this admin has set it up. When it's off nothing
  // about it is shown anywhere.
  const [twoFactor, setTwoFactor] = useState<TwoFactor | null>(null);
  const signedOutPage = NO_SIDEBAR_PATHS.includes(pathname);

  useEffect(() => {
    if (signedOutPage) return;
    adminFetch('/admin-auth/2fa/status').then(async (res) => { if (res.ok) setTwoFactor(await res.json()); }).catch(() => {});
  }, [signedOutPage, pathname === '/admin/security']); // refresh after setup changes it

  if (NO_SIDEBAR_PATHS.includes(pathname)) {
    return (
      <div className="admin-root">
        {children}
      </div>
    );
  }

  return (
    <div className="admin-root">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-brand">Shops Platform</div>
          <div className="admin-sidebar-tag">Operator console</div>
          <AdminNav showSecurity={Boolean(twoFactor?.available)} />
        </aside>
        <main className="admin-content">
          {twoFactor?.available && !twoFactor.enabled && pathname !== '/admin/security' ? (
            <div className="admin-alert is-warning">
              Your account doesn&apos;t use two-factor sign-in yet. <Link href="/admin/security">Set it up</Link> so a stolen password can&apos;t open this console.
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
