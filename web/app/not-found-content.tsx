import Link from 'next/link';
import { WhatsAppIcon } from './whatsapp-icon';

/**
 * The body of the storefront's 404 page, shared by the two places Next can
 * render one: app/not-found.tsx (a URL no route matches at all, which
 * renders outside the storefront layout) and app/(storefront)/not-found.tsx
 * (a page that called notFound(), e.g. a product slug that doesn't exist,
 * which renders inside it with the header/footer already around it).
 */
export function NotFoundContent({ shopName, whatsappNumber }: { shopName: string; whatsappNumber: string | null }) {
  const digits = (whatsappNumber || '').replace(/[^\d]/g, '');
  return (
    <main className="shop-container shop-section" style={{ textAlign: 'center', maxWidth: 560 }}>
      <span className="eyebrow">404</span>
      <h1 style={{ marginBottom: 'var(--shop-space-3)' }}>We can&apos;t find that page</h1>
      <p style={{ color: 'var(--shop-muted)', marginBottom: 'var(--shop-space-6)' }}>
        The link may be out of date, or the item may have sold out and been taken down. Have a look around {shopName} instead.
      </p>
      <div style={{ display: 'flex', gap: 'var(--shop-space-3)', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/" className="btn btn-primary">Back to {shopName}</Link>
        <Link href="/#catalog" className="btn btn-outline">Browse all products</Link>
        {digits ? (
          <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className="btn btn-accent">
            <WhatsAppIcon /> Ask us on WhatsApp
          </a>
        ) : null}
      </div>
    </main>
  );
}
