"use client";

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ShopInfo, ShopProduct } from '@/app/lib/api';
import { useCart } from '@/app/lib/cart';
import { FavoriteButton } from '@/app/favorite-button';
import { ShareButton } from '@/app/share-button';
import { ProductCard } from '@/app/product-card';
import { WhatsAppIcon } from '@/app/whatsapp-icon';

/**
 * Builds a structured WhatsApp enquiry for one product/size, the same shape
 * as the cart page's own buildWhatsappMessage (cart-client.tsx) but scoped
 * to a single item -- named fields the shop can act on without asking who's
 * writing and which listing they mean.
 *
 * Takes origin explicitly rather than reading window.location itself: doing
 * that inline during render makes the server-rendered markup ("Link:" line
 * omitted, since the server has no window) differ from the client's first
 * render, and React's hydration then locks in the server's version -- the
 * link would stay missing until some unrelated state change forced a
 * re-render. Callers pass origin from a useEffect-populated value instead,
 * so both the very first client render and every render after start correct
 * (a brief absence during the pre-effect first paint, not a stuck omission).
 */
function buildEnquiry(product: ShopProduct, chosen: ShopProduct['variants'][number] | null, manualSize: string, origin: string | null) {
  const lines: string[] = [];
  if (chosen) {
    lines.push(`Hi! I'd like to order:`);
    lines.push('');
    lines.push(`Item:  ${product.name}${product.brand ? ` (${product.brand})` : ''}`);
    if (chosen.size) lines.push(`Size:  ${chosen.size}`);
    lines.push(`SKU:   ${chosen.sku}`);
    lines.push(`Price: KES ${Number(chosen.priceKes).toLocaleString()}`);
    if (chosen.stockOnHand <= 0) lines.push('(Available to Order -- usual lead time applies)');
  } else {
    lines.push(`Hi! I'm interested in the ${product.name}.`);
    lines.push('');
    lines.push('What sizes do you have?');
  }
  if (manualSize.trim()) lines.push(`Size needed (not listed): ${manualSize.trim()}`);
  if (origin) {
    lines.push('');
    lines.push(`Link: ${origin}/shop/${product.slug}`);
  }
  return lines.join('\n');
}

export function ProductClient({ product, shopInfo }: { product: ShopProduct; shopInfo: ShopInfo }) {
  const cart = useCart();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? null);
  const [manualSize, setManualSize] = useState('');
  const [added, setAdded] = useState(false);
  const [image, setImage] = useState(0);
  // Populated client-side only (see buildEnquiry's comment) -- null on the
  // server and on the client's very first paint, set immediately after via
  // this effect.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const chosen = product.variants.find((v) => v.id === variantId) || null;
  const isOnSale = chosen?.wasPriceKes && Number(chosen.wasPriceKes) > Number(chosen.priceKes);

  const shareUrl = origin ? `${origin}/shop/${product.slug}` : `/shop/${product.slug}`;
  const shareText = `${product.name}${product.brand ? ` by ${product.brand}` : ''}${chosen ? ` — KES ${Number(chosen.priceKes).toLocaleString()}` : ''}`;

  const whatsappNumber = (shopInfo.whatsappNumber || '').replace(/[^\d]/g, '');
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(buildEnquiry(product, chosen, manualSize, origin))}`
    : null;

  return (
    <main className="shop-container shop-section">
      <div className="pdp-layout">
        <div className="pdp-gallery">
          <div className="pdp-gallery-main">
            {product.imageUrls[image] ? (
              <Image
                src={product.imageUrls[image]}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 500px"
                style={{ objectFit: 'cover' }}
                priority
              />
            ) : (
              <div className="product-card-placeholder" style={{ fontSize: 'var(--shop-text-3xl)' }}>{product.name.charAt(0)}</div>
            )}
          </div>
          {product.imageUrls.length > 1 ? (
            <div className="pdp-gallery-thumbs">
              {product.imageUrls.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  className={index === image ? 'is-on' : undefined}
                  onClick={() => setImage(index)}
                  aria-label={`View image ${index + 1}`}
                >
                  <Image src={url} alt="" fill sizes="66px" style={{ objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pdp-info">
          {product.category ? <span className="eyebrow">{product.category.name}</span> : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <h1>{product.name}</h1>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <FavoriteButton productId={product.id} />
              <ShareButton url={shareUrl} title={product.name} text={shareText} compact />
            </div>
          </div>

          {chosen ? (
            <div className="pdp-price">
              {isOnSale ? <span className="was">KES {Number(chosen.wasPriceKes).toLocaleString()}</span> : null}
              <span>KES {Number(chosen.priceKes).toLocaleString()}</span>
              {isOnSale ? <span className="sale-badge">Sale</span> : null}
            </div>
          ) : null}

          {product.description ? <p className="pdp-description">{product.description}</p> : null}

          {product.variants.length > 0 ? (
            <div>
              <div className="pdp-field-label">
                <span>Size</span>
                {chosen ? <span className="selected-value">{chosen.size ?? chosen.name}</span> : null}
              </div>
              <div className="size-grid">
                {/* Never disabled: a zero-stock size is still orderable, it
                    just needs a WhatsApp message to confirm lead time -- see
                    the "Available to Order" note below the grid. */}
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`size-swatch${v.id === variantId ? ' is-selected' : ''}${v.stockOnHand <= 0 ? ' is-preorder' : ''}`}
                    onClick={() => setVariantId(v.id)}
                  >
                    {v.size ?? v.name}
                  </button>
                ))}
              </div>
              {chosen && chosen.stockOnHand <= 0 ? (
                <p className="pdp-preorder-note">Available to Order -- message us on WhatsApp for lead time.</p>
              ) : null}
            </div>
          ) : null}

          <div className="manual-size-block">
            <label htmlFor="manual-size-input">Don&apos;t see your size?</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                id="manual-size-input"
                value={manualSize}
                onChange={(e) => setManualSize(e.target.value)}
                placeholder="Type your size"
              />
              {manualSize.trim() ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    cart.add({
                      variantId: null,
                      productSlug: product.slug,
                      name: product.name,
                      size: manualSize.trim(),
                      sku: '',
                      priceKes: chosen ? Number(chosen.priceKes) : 0,
                      imageUrl: product.imageUrls[0] || null,
                      isCustomSize: true,
                    });
                    setManualSize('');
                    setAdded(true);
                    window.setTimeout(() => setAdded(false), 2000);
                  }}
                >
                  Add
                </button>
              ) : null}
            </div>
          </div>

          <div className="pdp-actions">
            <button
              className="btn btn-primary btn-block"
              disabled={!chosen}
              onClick={() => {
                if (!chosen) return;
                cart.add({
                  variantId: chosen.id,
                  productSlug: product.slug,
                  name: product.name,
                  size: chosen.size ?? chosen.name,
                  sku: chosen.sku,
                  priceKes: Number(chosen.priceKes),
                  imageUrl: product.imageUrls[0] || null,
                });
                setAdded(true);
                window.setTimeout(() => setAdded(false), 2000);
              }}
            >
              {added ? 'Added to cart' : chosen ? 'Add to cart' : 'Select a size'}
            </button>

            {whatsappHref ? (
              // suppressHydrationWarning: this href intentionally differs
              // between the server render (no page link yet, origin is
              // unknown server-side) and the client's first paint (gains
              // the "Link:" line once the mount effect sets `origin`) -- see
              // buildEnquiry's header comment. Without this, React logs a
              // hydration-mismatch warning even though the end state is
              // correct.
              <a className="btn btn-accent btn-block pdp-whatsapp-btn" href={whatsappHref} suppressHydrationWarning target="_blank" rel="noreferrer">
                <WhatsAppIcon /> {chosen ? 'Order this on WhatsApp' : 'Ask about sizes on WhatsApp'}
              </a>
            ) : null}
          </div>

          <div className="trust-row">
            <span>Secure checkout</span>
            <span>Fast local delivery</span>
            <span>WhatsApp support</span>
          </div>
        </div>
      </div>

      {product.related && product.related.length > 0 ? (
        <section className="related-products">
          <h2>You might also like</h2>
          <div className="product-grid">
            {product.related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
