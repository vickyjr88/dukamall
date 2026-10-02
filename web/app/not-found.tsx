import { headers } from 'next/headers';
import { getTheme } from '@/app/lib/api';
import { ThemeInjector } from '@/app/theme-injector';
import {
  ADMIN_DESTINATIONS, NotFoundView, PORTAL_DESTINATIONS, StorefrontNotFoundView,
} from '@/app/not-found-content';

/**
 * Renders for any URL no route matches. That happens OUTSIDE the storefront
 * layout (which is what applies the shop's theme), so this has to bring its
 * own theme: middleware.ts sets x-shop-id for storefront requests, and with
 * it this loads the shop's theme the same way the layout does.
 *
 * /portal and /admin skip shop resolution (see middleware.ts), so they get
 * a plain page whose cards lead into that area; x-pathname, also set by
 * middleware, says which. A failed shop lookup falls back to the same plain
 * page rather than turning a 404 into a 500.
 */
export default async function NotFound() {
  const h = headers();

  if (h.get('x-shop-id')) {
    try {
      const theme = await getTheme();
      const view = await StorefrontNotFoundView();
      return (
        <div data-layout={theme.layoutPreset}>
          <ThemeInjector theme={theme} />
          {view}
        </div>
      );
    } catch {
      // Fall through to the plain page below.
    }
  }

  const path = h.get('x-pathname') || '';
  if (path.startsWith('/admin')) {
    return (
      <NotFoundView
        title="That admin page doesn't exist"
        lede="The address may be mistyped or out of date. These are the main parts of the operator console."
        destinations={ADMIN_DESTINATIONS}
      />
    );
  }
  if (path.startsWith('/portal')) {
    return (
      <NotFoundView
        title="That page doesn't exist"
        lede="The address may be mistyped or out of date. These are the main parts of your portal."
        destinations={PORTAL_DESTINATIONS}
      />
    );
  }

  return (
    <NotFoundView
      title="Page not found"
      lede="This address doesn't lead anywhere. If you manage a shop or run the platform, these will get you back in."
      destinations={[PORTAL_DESTINATIONS[0], ADMIN_DESTINATIONS[0]]}
    />
  );
}
