"use client";

import { useEffect } from 'react';
import { fireAdEvent, useTracker } from './tracking';
import { productSlugOfPath, telLinkOf } from './contact-taps';

/**
 * Records the start of a visit, with where it came from, as soon as any storefront page opens, and counts every tap on a phone number on the site.
 * Renders nothing.
 */
export function StorefrontTracker() {
  const { track } = useTracker();
  useEffect(() => {
    track('SESSION_START');
  }, [track]);

  // A tap on any tel: link, wherever it sits: calls are a conversion the shop could not see before. Capturing, so a link that stops the event (or
  // navigates in its own handler) is still counted.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const tap = telLinkOf(event.target);
      if (!tap) return;
      track('CALL_CLICK', { detail: tap.source, productSlug: productSlugOfPath(window.location.pathname) ?? undefined });
      fireAdEvent('contact');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [track]);

  return null;
}
