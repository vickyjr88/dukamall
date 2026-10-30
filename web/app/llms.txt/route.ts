import { getCategories, getPage, getPages, getProducts, getShopInfo } from '@/app/lib/api';
import { buildCollections, collectionFacts, collectionPath, isIndexable } from '@/app/lib/collections';
import { currentOrigin, truncate } from '@/app/lib/seo';
import { plainText } from '@/app/lib/rich-text';

export const dynamic = 'force-dynamic';

// /llms.txt -- a short, plain-text briefing about the shop for AI assistants and answer
// engines (llmstxt.org): who it is, where it is, what it sells, which pages answer which
// questions. Built from the same shop data as the storefront, so it can't go stale.
export async function GET() {
  const origin = currentOrigin();
  const [shop, categories, pages, products] = await Promise.all([getShopInfo(), getCategories(), getPages(), getProducts()]);

  // One line per content page: its title plus the first sentence-ish of what it says.
  const pageLines = await Promise.all(
    pages.slice(0, 12).map(async (p) => {
      const full = await getPage(p.slug);
      const body = full ? plainText(full.body.split('\n').filter((l) => !/^\s*#{1,3}\s/.test(l)).join('\n')) : '';
      const summary = body ? `: ${truncate(body, 140)}` : '';
      return `- [${p.title}](${origin}/pages/${p.slug})${summary}`;
    }),
  );

  const inCategory = (slug: string) => products.filter((p) => p.category?.slug === slug).length;
  // Only brands with a real collection (3+ products): a stray or luxury name in the brand field is not listed as a brand the shop stocks.
  const brands = buildCollections(products).filter((c) => c.kind === 'brand' && isIndexable(c)).map((c) => c.name).sort();
  const prices = products.flatMap((p) => p.variants.map((v) => Number(v.priceKes))).filter((n) => n > 0);

  const collections = buildCollections(products).filter(isIndexable).map((c) => {
    const f = collectionFacts(c);
    const range = f.minPrice === null ? '' : f.maxPrice! > f.minPrice ? `, ${shop.currency} ${f.minPrice.toLocaleString('en-US')} to ${f.maxPrice!.toLocaleString('en-US')}` : `, ${shop.currency} ${f.minPrice.toLocaleString('en-US')}`;
    return `- [${c.name}${c.kind === 'brand' ? ` ${c.noun}` : ''}](${origin}${collectionPath(c)}): ${f.count} styles${range}`;
  });

  const facts = [
    shop.address ? `- Location: ${shop.address}` : null,
    shop.openingHours ? `- Opening hours: ${shop.openingHours}` : null,
    shop.contactPhone ? `- Phone: ${shop.contactPhone}` : null,
    shop.whatsappNumber ? `- WhatsApp: ${shop.whatsappNumber}` : null,
    shop.contactEmail ? `- Email: ${shop.contactEmail}` : null,
    `- Currency: ${shop.currency}`,
    prices.length ? `- Prices: ${shop.currency} ${Math.min(...prices).toLocaleString('en-US')} to ${Math.max(...prices).toLocaleString('en-US')}` : null,
    brands.length ? `- Brands: ${brands.join(', ')}` : null,
    shop.freeDeliveryOverKes ? `- Free delivery on orders over ${shop.currency} ${shop.freeDeliveryOverKes.toLocaleString('en-US')}` : null,
    ...[['Instagram', shop.instagramUrl], ['Facebook', shop.facebookUrl], ['TikTok', shop.tiktokUrl], ['X', shop.xUrl]]
      .filter(([, url]) => url)
      .map(([label, url]) => `- ${label}: ${url}`),
  ].filter(Boolean);

  const lines = [
    `# ${shop.name}`,
    '',
    `> ${shop.seoDescription || shop.tagline || `${shop.name} is an online shop.`}`,
    '',
    ...facts,
    '',
    '## Shop',
    '',
    `- [All products](${origin}/): ${products.length} products currently listed`,
    ...categories
      .filter((c) => inCategory(c.slug) > 0)
      .map((c) => `- [${c.name}](${origin}/?category=${c.slug}): ${inCategory(c.slug)} products`),
    '',
    ...(collections.length ? ['## Brands and models', '', ...collections, ''] : []),
    ...(pageLines.length ? ['## Information', '', ...pageLines, ''] : []),
    '## For machines',
    '',
    `- [Sitemap](${origin}/sitemap.xml): every product and page`,
    `- [Product feed](${origin}/product-feed.xml): structured product data with prices and availability`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=3600',
      'Vary': 'Host',
    },
  });
}
