"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

// The same shapes the backend accepts (backend/src/common/tracking-ids.ts). They are checked again
// here because each ID is written into an inline script, and nothing that is not exactly an ID
// may ever end up inside one.
const META_ID = /^[0-9]{8,20}$/;
const TIKTOK_ID = /^[A-Z0-9]{10,30}$/;
const X_ID = /^[a-z0-9]{4,12}$/;

type Pixels = { metaPixelId?: string | null; tiktokPixelId?: string | null; xPixelId?: string | null };

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { page: () => void };
    twq?: (...args: unknown[]) => void;
  }
}

/**
 * Meta, TikTok and X ad pixels for one shop's storefront pages. Each shop has its own IDs, so each
 * domain reports to its own ad accounts; nothing is loaded for a platform the shop hasn't set up.
 * The scripts load once the page is interactive, so they never delay what shoppers see.
 *
 * Each pixel records the first page view itself. The storefront moves between pages without a full
 * reload, so a page view is also sent whenever the address changes after that.
 */
export function AdPixels({ metaPixelId, tiktokPixelId, xPixelId }: Pixels) {
  const meta = metaPixelId && META_ID.test(metaPixelId) ? metaPixelId : null;
  const tiktok = tiktokPixelId && TIKTOK_ID.test(tiktokPixelId) ? tiktokPixelId : null;
  const x = xPixelId && X_ID.test(xPixelId) ? xPixelId : null;

  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; } // the base snippets already sent this one
    if (meta) window.fbq?.('track', 'PageView');
    if (tiktok) window.ttq?.page();
    if (x) window.twq?.('track', 'PageView');
  }, [pathname, meta, tiktok, x]);

  return (
    <>
      {meta ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${meta}');fbq('track','PageView');`}
        </Script>
      ) : null}
      {tiktok ? (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=r+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tiktok}');ttq.page();}(window,document,'ttq');`}
        </Script>
      ) : null}
      {x ? (
        <Script id="x-pixel" strategy="afterInteractive">
          {`!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments)},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
twq('config','${x}');`}
        </Script>
      ) : null}
    </>
  );
}
