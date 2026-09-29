"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShopProduct } from './lib/api';
import { ShareButton } from './share-button';
import { FavoriteButton } from './favorite-button';
import { useShopInfo } from './lib/shop-info-context';

function currentPrice(product: ShopProduct) {
  const inStock = product.variants.find((v) => v.stockOnHand > 0) ?? product.variants[0];
  return inStock ?? null;
}

/**
 * "36–44" from a list of sizes, or a single size when only one is left.
 * Ported from drip-crm's product-card.tsx -- sorted numerically because
 * "EUR 39" sorts before "EUR 7" as text, and a range built from a text sort
 * would be wrong.
 */
function sizeRange(sizes: string[]) {
  const numbers = sizes
    .map((size) => parseInt(size.replace(/\D/g, ''), 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!numbers.length) return '';
  const low = numbers[0];
  const high = numbers[numbers.length - 1];
  return low === high ? String(low) : `${low}–${high}`;
}

export function ProductCard({ product }: { product: ShopProduct }) {
  const variant = currentPrice(product);
  const isOnSale = variant?.wasPriceKes && Number(variant.wasPriceKes) > Number(variant.priceKes);
  // Never a dead end: a product with nothing on the shelf is still shown as
  // orderable (message the shop for lead time), never as a flat "Sold out"
  // with nothing to do about it.
  const needsOrder = product.variants.length > 0 && product.variants.every((v) => v.stockOnHand <= 0);
  const sizesInStock = product.variants
    .filter((v) => v.stockOnHand > 0 && (v.size || v.name))
    .map((v) => v.size ?? v.name);
  // Populated client-side only, after mount -- see product-client.tsx's
  // buildEnquiry comment for why this can't be computed from window
  // directly during render (locks in a server-rendered value missing the
  // origin until some unrelated re-render happens to fix it).
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const shareUrl = origin ? `${origin}/shop/${product.slug}` : `/shop/${product.slug}`;
  const shareText = `${product.name}${product.brand ? ` by ${product.brand}` : ''}${variant ? ` — KES ${Number(variant.priceKes).toLocaleString()}` : ''}`;

  const shopInfo = useShopInfo();
  const whatsappNumber = (shopInfo?.whatsappNumber || '').replace(/[^\d]/g, '');
  const whatsappHref = whatsappNumber && variant
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
        [
          `Hi! I'd like to order:`,
          '',
          `Item:  ${product.name}${product.brand ? ` (${product.brand})` : ''}`,
          ...(variant.size ? [`Size:  ${variant.size}`] : []),
          `SKU:   ${variant.sku}`,
          `Price: KES ${Number(variant.priceKes).toLocaleString()}`,
          ...(variant.stockOnHand <= 0 ? ['(Available to Order -- usual lead time applies)'] : []),
          ...(origin ? ['', `Link: ${origin}/shop/${product.slug}`] : []),
        ].join('\n'),
      )}`
    : null;

  return (
    <article className={`product-card${needsOrder ? ' is-preorder' : ''}`}>
      <Link href={`/shop/${product.slug}`} className="product-card-media">
        {product.imageUrls[0] ? (
          <Image
            src={product.imageUrls[0]}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div className="product-card-placeholder">{product.name.charAt(0)}</div>
        )}
        {needsOrder ? (
          <span className="product-card-badge is-preorder">Available to Order</span>
        ) : isOnSale ? (
          <span className="product-card-badge is-sale">Sale</span>
        ) : null}
      </Link>

      <div className="product-card-overlay-actions">
        <FavoriteButton productId={product.id} />
        <ShareButton compact url={shareUrl} title={product.name} text={shareText} />
      </div>

      <div className="product-card-body">
        {product.brand ? <p className="product-card-brand">{product.brand}</p> : null}
        {/* The whole card used to be one <Link>, but the overlay buttons
            above need their own click targets -- so the name link now
            covers the body's clickable area via ::after stretching over
            the card (see .product-card-body h3 a in globals.css), keeping
            the same "click anywhere on the card" behavior. */}
        <h3 className="name"><Link href={`/shop/${product.slug}`}>{product.name}</Link></h3>
        {variant ? (
          <div className="price">
            {isOnSale ? <span className="was">KES {Number(variant.wasPriceKes).toLocaleString()}</span> : null}
            KES {Number(variant.priceKes).toLocaleString()}
          </div>
        ) : null}
        {sizesInStock.length ? (
          <p className="product-card-sizes">
            <span>Sizes</span>
            <em>{sizeRange(sizesInStock)}</em>
            {sizesInStock.length > 1 ? <small>{sizesInStock.length} available</small> : null}
          </p>
        ) : needsOrder ? (
          <p className="product-card-sizes is-preorder">Available to Order</p>
        ) : null}

        {whatsappHref ? (
          // suppressHydrationWarning: href depends on `origin`, only known
          // after mount -- see product-client.tsx's buildEnquiry comment.
          <a
            className="product-card-whatsapp"
            href={whatsappHref}
            suppressHydrationWarning
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Order on WhatsApp
          </a>
        ) : null}
      </div>
    </article>
  );
}
