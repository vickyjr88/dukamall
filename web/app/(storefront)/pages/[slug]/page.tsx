import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPage, getShopInfo, getTheme } from '@/app/lib/api';
import { homePreviewImageUrl } from '@/app/lib/home-preview';
import { currentOrigin, OG_IMAGE_SIZE, truncate } from '@/app/lib/seo';
import { plainText, RichText } from '@/app/lib/rich-text';
import { faqJsonLd, JsonLd } from '@/app/lib/structured-data';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const [page, shopInfo, theme] = await Promise.all([getPage(params.slug), getShopInfo(), getTheme()]);
  if (!page) return {};
  const hasImage = Boolean(await homePreviewImageUrl(theme));
  const origin = currentOrigin();
  const title = `${page.title} | ${shopInfo.name}`;
  // Headings are skipped so the snippet opens with the first real sentence, not a section title.
  const withoutHeadings = page.body.split('\n').filter((line) => !/^\s*#{1,3}\s/.test(line)).join('\n');
  const description = truncate(plainText(withoutHeadings), 160) || undefined;
  const url = `${origin}/pages/${page.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    // Same share card as the home page, so a shared About/FAQ link isn't a bare URL.
    openGraph: {
      type: 'website',
      siteName: shopInfo.name,
      title,
      description,
      url,
      locale: 'en_KE',
      images: hasImage ? [{ url: `${origin}/og/home`, ...OG_IMAGE_SIZE, alt: shopInfo.name, type: 'image/jpeg' }] : [],
    },
  };
}

// A merchant-written content page (About, Delivery & returns, ...). The body
// goes through RichText, which builds elements itself instead of injecting HTML.
export default async function ContentPage({ params }: { params: { slug: string } }) {
  const page = await getPage(params.slug);
  if (!page) notFound();

  return (
    <main className="shop-container shop-page">
      <JsonLd data={faqJsonLd(page.body)} />
      <h1>{page.title}</h1>
      <RichText text={page.body} />
    </main>
  );
}
