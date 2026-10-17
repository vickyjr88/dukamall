import type { ShopInfo, ShopTheme } from '@/app/lib/api';
import { plainText } from '@/app/lib/rich-text';

/**
 * schema.org JSON-LD for the storefront: what the shop is (Organization / Store + WebSite),
 * where a page sits (BreadcrumbList), and a merchant's FAQ page (FAQPage). Search engines use
 * it for rich results; answer engines and AI assistants use it as the structured facts to quote.
 * Everything here is built from the shop's own data, never from visitor input.
 */

type JsonLdObject = Record<string, unknown>;

/** One <script type="application/ld+json"> per object. */
export function JsonLd({ data }: { data: JsonLdObject | null | undefined }) {
  if (!data) return null;
  // "<" is escaped so a stray "</script>" in merchant text can't close the tag early.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  // eslint-disable-next-line react/no-danger -- the one place Next.js documents for JSON-LD; the string is escaped above.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

function compact<T extends JsonLdObject>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
}

/** The shop itself. A shop with a street address is a physical Store; otherwise a plain Organization. */
export function organizationJsonLd(shop: ShopInfo, theme: Pick<ShopTheme, 'logoUrl'>, origin: string): JsonLdObject {
  const sameAs = [shop.instagramUrl, shop.facebookUrl, shop.tiktokUrl].filter(Boolean);
  return compact({
    '@context': 'https://schema.org',
    '@type': shop.address ? 'Store' : 'Organization',
    '@id': `${origin}/#organization`,
    name: shop.name,
    url: origin,
    description: shop.seoDescription || shop.tagline || undefined,
    logo: theme.logoUrl || undefined,
    image: theme.logoUrl || `${origin}/og/home`,
    telephone: shop.contactPhone || undefined,
    email: shop.contactEmail || undefined,
    address: shop.address
      ? { '@type': 'PostalAddress', streetAddress: shop.address, addressCountry: 'KE' }
      : undefined,
    // Free text ("Mon-Sat 8am-8pm") can't be turned into schema.org's structured hours reliably,
    // so it is left out rather than guessed at.
    currenciesAccepted: shop.currency,
    sameAs: sameAs.length ? sameAs : undefined,
  });
}

/** Names the site and tells search engines how the storefront search box works. */
export function websiteJsonLd(shop: ShopInfo, origin: string): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: shop.name,
    url: origin,
    publisher: { '@id': `${origin}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/?search={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * A FAQ page is written as paragraphs whose first line is the question in bold and whose
 * following lines are the answer:
 *
 *   **Do you deliver?**
 *   Yes, countrywide.
 *
 * Returns the question/answer pairs found in a page body (any page, so a merchant's own
 * "Shipping questions" page works too).
 */
export function parseFaq(body: string): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  for (const block of body.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const match = lines.length > 1 ? /^\*\*(.+\?)\*\*$/.exec(lines[0]) : null;
    if (!match) continue;
    const answer = plainText(lines.slice(1).join(' ')).trim();
    if (answer) pairs.push({ question: match[1].trim(), answer });
  }
  return pairs;
}

/** FAQPage markup, only when the page really is a list of questions (at least two). */
export function faqJsonLd(body: string): JsonLdObject | null {
  const pairs = parseFaq(body);
  if (pairs.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: pairs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}
