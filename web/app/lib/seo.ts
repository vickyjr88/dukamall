import { headers } from 'next/headers';

/**
 * The origin a page's metadata/structured data should point at -- the Host
 * header a request actually arrived on (a shop's verified custom domain or
 * its platform subdomain), the same source middleware.ts used to resolve
 * x-shop-id in the first place. Not derived from Shop.customDomain via an
 * API call: the incoming Host header IS the canonical domain for this
 * request already, with no extra round-trip needed.
 */
export function currentOrigin(): string {
  const host = headers().get('host') || 'localhost:3202';
  // Matches both bare localhost and a shop's local subdomain
  // (msa.localhost:3202, the dev convention this platform's own README/
  // launch config uses for per-shop local testing).
  const isLocal = /(^|\.)localhost(:\d+)?$/.test(host) || host.startsWith('127.0.0.1');
  return `${isLocal ? 'http' : 'https'}://${host}`;
}
