// IndexNow ownership proof (indexnow.org): the key must be readable on every shop's own domain. Every storefront
// serves this same file at /indexnow-key.txt and scripts/indexnow.sh passes that address as the keyLocation.
// The key is public by design; it only proves the site is ours.
const INDEXNOW_KEY = 'd0c89638cb0461ac4ae247e476080981';

export function GET() {
  return new Response(INDEXNOW_KEY, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
