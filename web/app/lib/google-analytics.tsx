import Script from 'next/script';

// Google issues GA4 IDs as G- plus about 10 letters/digits. The backend only saves
// IDs of this shape; it is checked again here because the value goes into an inline
// script, and nothing that isn't exactly an ID may ever be written into one.
const GA4_ID = /^G-[A-Z0-9]{6,14}$/;

/**
 * Google Analytics 4 for one shop's storefront pages. Each shop has its own
 * Measurement ID, so each domain reports to its own property. Renders nothing when
 * the shop hasn't set one.
 *
 * Page views: gtag's default "enhanced measurement" also records the browser-history
 * changes Next.js makes when a shopper moves between pages, so no per-route code is
 * needed. Loaded after the page is interactive so it never delays what shoppers see.
 */
export function GoogleAnalytics({ measurementId }: { measurementId?: string | null }) {
  if (!measurementId || !GA4_ID.test(measurementId)) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');`}
      </Script>
    </>
  );
}
