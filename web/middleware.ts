import { NextRequest, NextResponse } from 'next/server';

/**
 * Tenant resolution -- design doc S:2.4. Every request's Host header is
 * resolved to a shop by the backend (custom domain or <slug>.PLATFORM_DOMAIN
 * subdomain), and the resolved shopId is forwarded as x-shop-id on every
 * downstream fetch this request makes to the API. Without this header the
 * backend's ShopScopeGuard refuses every request outright -- see
 * backend/src/common/shop-scope.guard.ts.
 *
 * The /portal/* admin routes are the one exception: a staff member's own JWT
 * already carries their shopId, so no host-based resolution applies there --
 * see app/portal/layout.tsx.
 */

const API_BASE_URL = (process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3200').replace(/\/$/, '');

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';

  if (request.nextUrl.pathname.startsWith('/portal')) {
    return NextResponse.next();
  }

  try {
    const response = await fetch(`${API_BASE_URL}/resolve-shop/${encodeURIComponent(host)}`);
    if (!response.ok) {
      return new NextResponse('No shop found for this domain', { status: 404 });
    }
    const shop = await response.json();

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-shop-id', shop.id);
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return new NextResponse('Shop lookup failed', { status: 502 });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
