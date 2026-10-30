import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CollectionPage, collectionExists, collectionMetadata } from '../../collection-page';

// Built from the shop's live catalogue on every request, so prices, sizes and stock counts in the copy are always current.
export const dynamic = 'force-dynamic';

export const generateMetadata = ({ params }: { params: { slug: string } }): Promise<Metadata> => collectionMetadata('collection', params.slug);

export default async function Page({ params }: { params: { slug: string } }) {
  if (!(await collectionExists('collection', params.slug))) notFound();
  return <CollectionPage kind="collection" slug={params.slug} />;
}
