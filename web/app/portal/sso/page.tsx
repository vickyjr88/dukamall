"use client";

/**
 * One-time landing for the admin console's "View as shop" -- the admin
 * origin can't set localStorage on this shop's own origin directly, so the
 * token rides here as a query param instead. Stores it under the same key
 * every other portal login already uses (login/page.tsx) and redirects
 * immediately, so the token never lingers in the visible URL past this one
 * hop.
 */

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SsoHandler() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      router.replace('/portal/login');
      return;
    }
    window.localStorage.setItem('shops_platform_token', token);
    router.replace('/portal/dashboard');
  }, [params, router]);

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
