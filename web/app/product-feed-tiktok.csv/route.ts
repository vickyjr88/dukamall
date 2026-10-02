import { proxyFeed } from '@/app/lib/feed-proxy';

// Feeds are per-shop and change with stock/price, so never cache a render.
export const dynamic = 'force-dynamic';

export function GET() {
  return proxyFeed('/product-feed-tiktok.csv');
}
