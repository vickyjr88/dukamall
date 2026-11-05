"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OptionGroup, ShopInfo, ShopProduct } from '@/app/lib/api';
import { hasSize, optionEntries, variantLabel } from '@/app/lib/variant-options';
import { useCart } from '@/app/lib/cart';
import { FavoriteButton } from '@/app/favorite-button';
import { ShareButton } from '@/app/share-button';
import { ProductCard } from '@/app/product-card';
import { WhatsAppIcon } from '@/app/whatsapp-icon';
import { fireAdEvent, useTracker } from '@/app/lib/tracking';

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
function buildEnquiry(product: ShopProduct, chosen: ShopProduct['variants'][number] | null, manualSize: string, origin: string | null, groups: OptionGroup[]) {
  const sized = product.variants.some(hasSize);
  const lines: string[] = [];
  if (chosen) {
    lines.push(`Hi! I'd like to order:`);
    lines.push('');
    lines.push(`Item:  ${product.name}${product.brand ? ` (${product.brand})` : ''}`);
    const options = optionEntries(chosen.attributes);
    if (options.length) {
      // A phone's enquiry says which storage, colour and condition, so the shop never has to ask.
      for (const [key, value] of options) lines.push(`${groups.find((g) => g.key === key)?.label ?? key}: ${value}`);
    } else if (chosen.size) lines.push(`Size:  ${chosen.size}`);
    lines.push(`SKU:   ${chosen.sku}`);
    lines.push(`Price: KES ${Number(chosen.priceKes).toLocaleString()}`);
    if (chosen.stockOnHand <= 0) lines.push('(Available to Order -- usual lead time applies)');
  } else {
    lines.push(`Hi! I'm interested in the ${product.name}.`);
    lines.push('');
    lines.push(sized ? 'What sizes do you have?' : 'Is it available?');
  }
  if (manualSize.trim()) lines.push(`Size needed (not listed): ${manualSize.trim()}`);
  if (origin) {
    lines.push('');
    lines.push(`Link: ${origin}/shop/${product.slug}`);
  }
  return lines.join('\n');
}

/** brandPage: the shop's landing page for this product's brand, when it has one (links shoppers and crawlers there). */
export function ProductClient({ product, shopInfo, brandPage }: { product: ShopProduct; shopInfo: ShopInfo; brandPage?: { href: string; label: string } }) {
  const cart = useCart();
  const { track } = useTracker();
  const groups = product.optionGroups ?? [];
  const sized = product.variants.some(hasSize);
  // Start on the first combination that is on the shelf, so the price and photo a shopper first sees can be bought today.
  const [variantId, setVariantId] = useState((product.variants.find((v) => v.stockOnHand > 0) ?? product.variants[0])?.id ?? null);
  const [manualSize, setManualSize] = useState('');
  const [added, setAdded] = useState(false);
  const [image, setImage] = useState(0);
  // Populated client-side only (see buildEnquiry's comment) -- null on the
  // server and on the client's very first paint, set immediately after via
  // this effect.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const chosen = product.variants.find((v) => v.id === variantId) || null;
  // One product view per visit to this page, with what the ads need to match it to the catalogue.
  useEffect(() => {
    track('VIEW_PRODUCT', { productSlug: product.slug });
    const first = product.variants.find((v) => v.stockOnHand > 0) ?? product.variants[0];
    fireAdEvent('view', { ids: first?.sku ? [first.sku] : undefined, name: product.name, value: first ? Number(first.priceKes) : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.slug]);
  const picked = chosen?.attributes ?? {};

  // Choosing one option keeps the others where they can still be had; where the exact combination does not exist, the
  // closest one (most options kept, then in stock) is chosen instead, so the page never shows a combination that is not for sale.
  function pick(key: string, value: string) {
    const wanted = { ...picked, [key]: value };
    const score = (v: ShopProduct['variants'][number]) => {
      const attrs = v.attributes ?? {};
      if (attrs[key] !== value) return -1;
      return Object.entries(wanted).filter(([k, val]) => attrs[k] === val).length * 2 + (v.stockOnHand > 0 ? 1 : 0);
    };
    const best = product.variants.reduce<ShopProduct['variants'][number] | null>((top, v) => (score(v) > (top ? score(top) : -1) ? v : top), null);
    if (best) setVariantId(best.id);
  }
  // A value that cannot be had today (with the other choices kept) is drawn as order-on-request, never disabled.
  function inStockWith(key: string, value: string) {
    return product.variants.some((v) => v.stockOnHand > 0 && v.attributes?.[key] === value && Object.entries(picked).every(([k, val]) => k === key || v.attributes?.[k] === val));
  }
  const condition = picked.condition && !/^(brand )?new$/i.test(picked.condition) ? picked.condition : null;
  const isOnSale = chosen?.wasPriceKes && Number(chosen.wasPriceKes) > Number(chosen.priceKes);

  const shareUrl = origin ? `${origin}/shop/${product.slug}` : `/shop/${product.slug}`;
  const shareText = `${product.name}${product.brand ? ` by ${product.brand}` : ''}${chosen ? ` — KES ${Number(chosen.priceKes).toLocaleString()}` : ''}`;

  const whatsappNumber = (shopInfo.whatsappNumber || '').replace(/[^\d]/g, '');
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(buildEnquiry(product, chosen, manualSize, origin, groups))}`
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

          {brandPage ? (
            <p style={{ margin: 0, fontSize: 'var(--shop-text-sm)' }}><Link href={brandPage.href}>{brandPage.label}</Link></p>
          ) : null}

          {chosen ? (
            <div className="pdp-price">
              {isOnSale ? <span className="was">KES {Number(chosen.wasPriceKes).toLocaleString()}</span> : null}
              <span>KES {Number(chosen.priceKes).toLocaleString()}</span>
              {isOnSale ? <span className="sale-badge">Sale</span> : null}
            </div>
          ) : null}

          {condition ? <p className="pdp-condition"><span className="sale-badge">{condition}</span></p> : null}

          {product.description ? <p className="pdp-description">{product.description}</p> : null}

          {groups.length > 0 ? (
            groups.map((group) => (
              <div key={group.key}>
                <div className="pdp-field-label">
                  <span>{group.label}</span>
                  {picked[group.key] ? <span className="selected-value">{picked[group.key]}</span> : null}
                </div>
                <div className="size-grid is-options">
                  {group.values.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`size-swatch${picked[group.key] === value ? ' is-selected' : ''}${!inStockWith(group.key, value) ? ' is-preorder' : ''}`}
                      onClick={() => pick(group.key, value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : product.variants.length > 1 || (product.variants.length === 1 && sized) ? (
            <div>
              <div className="pdp-field-label">
                <span>{sized ? 'Size' : 'Option'}</span>
                {chosen ? <span className="selected-value">{variantLabel(chosen)}</span> : null}
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
                    {variantLabel(v)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {chosen && chosen.stockOnHand <= 0 ? (
            <p className="pdp-preorder-note">Available to Order -- message us on WhatsApp for lead time.</p>
          ) : null}

          {sized && groups.length === 0 ? (
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
          ) : null}

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
                  size: variantLabel(chosen),
                  sku: chosen.sku,
                  priceKes: Number(chosen.priceKes),
                  imageUrl: product.imageUrls[0] || null,
                });
                setAdded(true);
                window.setTimeout(() => setAdded(false), 2000);
              }}
            >
              {added ? 'Added to cart' : chosen ? 'Add to cart' : sized ? 'Select a size' : 'Select an option'}
            </button>

            {whatsappHref ? (
              // suppressHydrationWarning: this href intentionally differs
              // between the server render (no page link yet, origin is
              // unknown server-side) and the client's first paint (gains
              // the "Link:" line once the mount effect sets `origin`) -- see
              // buildEnquiry's header comment. Without this, React logs a
              // hydration-mismatch warning even though the end state is
              // correct.
              <a
                className="btn btn-accent btn-block pdp-whatsapp-btn"
                href={whatsappHref}
                suppressHydrationWarning
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  track('WHATSAPP_CLICK', { productSlug: product.slug, detail: 'product-page' });
                  fireAdEvent('contact', { ids: chosen?.sku ? [chosen.sku] : undefined, name: product.name, value: chosen ? Number(chosen.priceKes) : undefined });
                }}
              >
                <WhatsAppIcon /> {chosen ? 'Order this on WhatsApp' : sized ? 'Ask about sizes on WhatsApp' : 'Ask on WhatsApp'}
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

      {product.specs && product.specs.length > 0 ? (
        <section className="pdp-specs" aria-labelledby="pdp-specs-title">
          <h2 id="pdp-specs-title">Specifications</h2>
          <table>
            <tbody>
              {product.specs.map((row, i) => (
                <tr key={`${row.label}-${i}`}>
                  <th scope="row">{row.label}</th>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

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
