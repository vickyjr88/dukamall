import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPage, getShopInfo } from '@/app/lib/api';
import { currentOrigin, truncate } from '@/app/lib/seo';
import { plainText, RichText } from '@/app/lib/rich-text';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const [page, shopInfo] = await Promise.all([getPage(params.slug), getShopInfo()]);
  if (!page) return {};
  return {
    title: `${page.title} | ${shopInfo.name}`,
    description: truncate(plainText(page.body), 160) || undefined,
    alternates: { canonical: `${currentOrigin()}/pages/${page.slug}` },
  };
}

// A merchant-written content page (About, Delivery & returns, ...). The body
// goes through RichText, which builds elements itself instead of injecting HTML.
export default async function ContentPage({ params }: { params: { slug: string } }) {
  const page = await getPage(params.slug);
  if (!page) notFound();

  return (
    <main className="shop-container shop-page">
      <h1>{page.title}</h1>
      <RichText text={page.body} />
    </main>
  );
}
