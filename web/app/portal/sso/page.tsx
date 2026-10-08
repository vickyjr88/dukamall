"use client";

/**
 * One-time landing for the admin console's "View as shop" -- the admin
 * origin can't set localStorage on this shop's own origin directly, so the
 * token rides here in the URL fragment (#token=...) instead. A fragment is
 * never sent to the server, so it stays out of access logs and Referer
 * headers; a query string would not. Stores it under the same key every other
 * portal login already uses (login/page.tsx) and replaces the history entry,
 * so the token doesn't linger in the address bar or in history.
 */

import { Suspense, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

function SsoHandler() {
  const router = useRouter();
  // Effects can run twice in development (React StrictMode). The first run removes
  // the fragment, so a second run would find no token and bounce to the login page.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    // Drop the fragment straight away, whatever happens next.
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      router.replace('/portal/login');
      return;
    }
    window.localStorage.setItem('shops_platform_token', token);
    router.replace('/portal/dashboard');
  }, [router]);

  return (
    <div className="portal-auth-shell">
      <div className="portal-auth-card">
        <div className="brand">Shops Platform</div>
        <p className="subtitle">Signing you in...</p>
      </div>
    </div>
  );
}

export default function PortalSsoPage() {
  return (
    <Suspense fallback={null}>
      <SsoHandler />
    </Suspense>
  );
}
