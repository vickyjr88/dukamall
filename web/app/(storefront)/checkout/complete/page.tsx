import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CompleteClient } from './complete-client';

// A personal confirmation: never something for search results.
export const metadata: Metadata = { title: 'Order confirmation', robots: { index: false, follow: false } };

export default function CheckoutCompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteClient />
    </Suspense>
  );
}
