"use client";

/**
 * What a shopper does on the storefront, reported two ways from one call: to this platform's own event store (so the
 * merchant's Analytics page can follow a visit from the ad to the order) and to whichever ad pixels the shop has set up
 * (so Meta and TikTok learn which clicks turn into buyers, not just which ones are cheap).
 *
 * Anonymous. The session id is a random string kept for the life of the browser tab; it holds no name, phone or email.
 */

import { useMemo } from 'react';
import { useShopId } from './shop-id-context';

const SESSION_KEY = 'ng_sid';
const STARTED_KEY = 'ng_started';

export type TrackType = 'SESSION_START' | 'VIEW_PRODUCT' | 'ADD_TO_CART' | 'BEGIN_CHECKOUT' | 'WHATSAPP_CLICK' | 'SEARCH';

/** The same shape the backend accepts (storefront-events SESSION_ID): letters and digits, 12 to 40 of them. */
function makeId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
}

/** This tab's session id, made on first use. Null where storage is refused (some private modes): nothing is then recorded. */
export function getSessionId(): string | null {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = makeId();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: { page: () => void; track?: (event: string, data?: Record<string, unknown>) => void };
    twq?: (...args: unknown[]) => void;
  }
}

export type AdEvent = 'view' | 'cart' | 'checkout' | 'purchase' | 'contact' | 'search';

export type AdData = {
  /** The id used in the product feed (the variant's SKU), so ads can match what was viewed to the catalogue. */
  ids?: string[];
  name?: string;
  value?: number;
  currency?: string;
  quantity?: number;
  searchString?: string;
};

const META_EVENT: Record<AdEvent, string> = { view: 'ViewContent', cart: 'AddToCart', checkout: 'InitiateCheckout', purchase: 'Purchase', contact: 'Contact', search: 'Search' };
const TIKTOK_EVENT: Record<AdEvent, string> = { view: 'ViewContent', cart: 'AddToCart', checkout: 'InitiateCheckout', purchase: 'CompletePayment', contact: 'Contact', search: 'Search' };

/** Tells the ad pixels, when the shop has them. A no-op otherwise, and never throws into the page. */
export function fireAdEvent(event: AdEvent, data: AdData = {}) {
  try {
    const currency = data.currency || 'KES';
    if (window.fbq) {
      window.fbq('track', META_EVENT[event], {
        ...(data.ids?.length ? { content_ids: data.ids, content_type: 'product' } : {}),
        ...(data.name ? { content_name: data.name } : {}),
        ...(data.value !== undefined ? { value: data.value, currency } : {}),
        ...(data.quantity ? { num_items: data.quantity } : {}),
        ...(data.searchString ? { search_string: data.searchString } : {}),
      });
    }
    if (window.ttq?.track) {
      window.ttq.track(TIKTOK_EVENT[event], {
        ...(data.ids?.[0] ? { content_id: data.ids[0], content_type: 'product' } : {}),
        ...(data.name ? { content_name: data.name } : {}),
        ...(data.value !== undefined ? { value: data.value, currency } : {}),
        ...(data.quantity ? { quantity: data.quantity } : {}),
        ...(data.searchString ? { query: data.searchString } : {}),
      });
    }
  } catch {
    // Tracking must never break the shop.
  }
}

export type Tracker = {
  /** Sends one event to the platform's own store. Fire and forget. */
  track: (type: TrackType, extra?: { productSlug?: string; detail?: string } & Record<string, unknown>) => void;
};

/** Visit details read from the address once, at the start of a session. */
function visitDetails() {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') || undefined,
    utmMedium: params.get('utm_medium') || undefined,
    utmCampaign: params.get('utm_campaign') || undefined,
    clickIds: { fbclid: params.has('fbclid'), ttclid: params.has('ttclid'), gclid: params.has('gclid') },
    referrer: document.referrer || undefined,
    landingPath: window.location.pathname,
  };
}

// True while the first request of a visit is on its way, so events fired in the meantime do not each start the visit again.
let startPending = false;

export function useTracker(): Tracker {
  const shopId = useShopId();
  return useMemo<Tracker>(() => ({
    track(type, extra = {}) {
      const sessionId = getSessionId();
      if (!sessionId) return;
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3200';
      const events: Record<string, unknown>[] = [];
      // The first event of a tab's session carries where the visit came from. The visit counts as started only once the
      // server has accepted it, so a request lost on a bad connection does not leave the whole visit unrecorded.
      let needStart = false;
      try {
        needStart = !window.sessionStorage.getItem(STARTED_KEY) && !startPending;
      } catch {
        // Storage refused: the event below is still sent.
      }
      // A visit starts once: a repeat of the start (React runs effects twice in development) is not sent again.
      if (type === 'SESSION_START' && !needStart) return;
      if (needStart) {
        startPending = true;
        if (type !== 'SESSION_START') events.push({ type: 'SESSION_START', ...visitDetails() });
      }
      events.push({ type, ...(type === 'SESSION_START' ? visitDetails() : {}), ...extra });
      void fetch(`${apiBase}/shop/events`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(shopId ? { 'x-shop-id': shopId } : {}) },
        body: JSON.stringify({ sessionId, events }),
      })
        .then((res) => {
          if (!needStart) return;
          startPending = false;
          if (res.ok) {
            try { window.sessionStorage.setItem(STARTED_KEY, '1'); } catch { /* storage refused */ }
          }
        })
        .catch(() => {
          if (needStart) startPending = false;
        });
    },
  }), [shopId]);
}
