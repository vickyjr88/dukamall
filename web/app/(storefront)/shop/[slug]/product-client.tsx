"use client";

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { OptionGroup, ShopInfo, ShopProduct } from '@/app/lib/api';
import { hasSize, optionEntries, variantLabel } from '@/app/lib/variant-options';
import { useCart } from '@/app/lib/cart';
import { FavoriteButton } from '@/app/favorite-button';
import { ShareButton } from '@/app/share-button';
import { ProductCard } from '@/app/product-card';
import { WhatsAppIcon } from '@/app/whatsapp-icon';
import { PhoneIcon } from '@/app/phone-icon';
import { telHref } from '@/app/lib/contact-taps';
import { assurances, trustChips } from '@/app/lib/trust';
import { fireAdEvent, useTracker } from '@/app/lib/tracking';
import { useShopStyle } from '@/app/lib/style-context';

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

/** The luxury styles drop the repeated "EUR" from a size ("EUR 42" becomes "42"); the label above the sizes says which scale it is. */
const shortSize = (label: string) => label.replace(/^EUR\s+/i, '');

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
  const { luxe } = useShopStyle();
  // Luxury gallery: click to zoom (a mouse), swipe to change photo (a phone).
  const [zoom, setZoom] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState('50% 50%');
  const touchStart = useRef<number | null>(null);
  // The buy bar shows (on a phone) while the page's own buttons are out of view: below the fold on arrival, above it once scrolled past.
  const actionsRef = useRef<HTMLDivElement>(null);
  const [barOn, setBarOn] = useState(false);
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

  function addChosenToCart() {
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
  }
  const photoCount = product.imageUrls.length;
  const go = (delta: number) => { if (photoCount > 1) { setImage((i) => (i + delta + photoCount) % photoCount); setZoom(false); } };
  const addLabel = added
    ? (luxe ? 'Added to bag' : 'Added to cart')
    : chosen ? (luxe ? 'Add to bag' : 'Add to cart') : sized ? 'Select a size' : 'Select an option';

  useEffect(() => {
    // Decided from where the real buttons are, on load, scroll and resize (not from an observer, which can be late to report after the layout
    // settles). The bar's own height is the margin: it stays until the real buttons have risen clear of it, so they are never half behind it.
    // One rect read per event, and setState does nothing when the answer has not changed, so this is cheap enough to run on every scroll.
    const check = () => {
      const element = actionsRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setBarOn(rect.top > window.innerHeight - 84 || rect.bottom < 0);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    // Photos and fonts finishing move the buttons without any scroll.
    const settle = window.setTimeout(check, 800);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      window.clearTimeout(settle);
    };
  }, []);

  // Lets the page's floating WhatsApp button step aside while the bar holds the same actions (see globals.css).
  useEffect(() => {
    document.body.classList.toggle('has-buybar', barOn);
    return () => document.body.classList.remove('has-buybar');
  }, [barOn]);

  const shareUrl = origin ? `${origin}/shop/${product.slug}` : `/shop/${product.slug}`;
  const shareText = `${product.name}${product.brand ? ` by ${product.brand}` : ''}${chosen ? ` — KES ${Number(chosen.priceKes).toLocaleString()}` : ''}`;

  const whatsappNumber = (shopInfo.whatsappNumber || '').replace(/[^\d]/g, '');
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(buildEnquiry(product, chosen, manualSize, origin, groups))}`
    : null;

  return (
    <main className={`shop-container shop-section${luxe ? ' pdp-main' : ''}`}>
      {luxe ? (
        <nav className="pdp-crumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          {product.category ? <><span aria-hidden="true">/</span><Link href={`/?category=${product.category.slug}#catalog`}>{product.category.name}</Link></> : null}
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.name}</span>
        </nav>
      ) : null}
      <div className="pdp-layout">
        {luxe ? (
          <div className={`pdp-gallery${photoCount > 1 ? '' : ' is-single'}`}>
            {photoCount > 1 ? (
              <div className="pdp-rail">
                {product.imageUrls.map((url, index) => (
                  <button key={url} type="button" className={index === image ? 'is-on' : undefined} onClick={() => { setImage(index); setZoom(false); }} aria-label={`View image ${index + 1}`}>
                    <Image src={url} alt="" fill sizes="84px" style={{ objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            ) : null}
            <div>
              <div
                className={`pdp-stage${zoom ? ' is-zoom' : ''}`}
                tabIndex={0}
                onClick={() => { if (window.matchMedia('(hover: hover)').matches) setZoom((z) => !z); }}
                onMouseMove={(e) => {
                  if (!zoom) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  setZoomOrigin(`${((e.clientX - box.left) / box.width) * 100}% ${((e.clientY - box.top) / box.height) * 100}%`);
                }}
                onMouseLeave={() => setZoom(false)}
                onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}
                onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                  if (touchStart.current === null) return;
                  const delta = e.changedTouches[0].clientX - touchStart.current;
                  touchStart.current = null;
                  if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
                }}
              >
                {product.imageUrls[image] ? (
                  <Image
                    src={product.imageUrls[image]}
                    alt={product.name}
                    fill
                    sizes="(max-width: 860px) 100vw, 760px"
                    style={{ objectFit: 'cover', transformOrigin: zoomOrigin }}
                    priority
                  />
                ) : (
                  <div className="product-card-placeholder" style={{ fontSize: 'var(--shop-text-3xl)' }}>{product.name.charAt(0)}</div>
                )}
                {photoCount > 1 ? (
                  <>
                    <button type="button" className="pdp-arrow is-prev" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); go(-1); }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg>
                    </button>
                    <button type="button" className="pdp-arrow is-next" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); go(1); }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                    </button>
                    <span className="pdp-counter">{image + 1} / {photoCount}</span>
                  </>
                ) : null}
              </div>
              {photoCount > 1 ? (
                <div className="pdp-dots" aria-hidden="true">
                  {product.imageUrls.map((url, index) => <button key={url} type="button" tabIndex={-1} className={index === image ? 'is-on' : undefined} onClick={() => setImage(index)} />)}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
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
        )}

        <div className="pdp-info">
          {luxe ? (
            (brandPage || product.brand) ? (
              brandPage
                ? <Link href={brandPage.href} className="pdp-brand">{product.brand ?? brandPage.label}</Link>
                : <span className="pdp-brand">{product.brand}</span>
            ) : null
          ) : product.category ? <span className="eyebrow">{product.category.name}</span> : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <h1>{product.name}</h1>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <FavoriteButton productId={product.id} />
              <ShareButton url={shareUrl} title={product.name} text={shareText} compact />
            </div>
          </div>

          {brandPage && !luxe ? (
            <p style={{ margin: 0, fontSize: 'var(--shop-text-sm)' }}><Link href={brandPage.href}>{brandPage.label}</Link></p>
          ) : null}

          {chosen ? (
            <div className="pdp-price">
              {isOnSale ? <span className="was">KES {Number(chosen.wasPriceKes).toLocaleString()}</span> : null}
              <span>KES {Number(chosen.priceKes).toLocaleString()}</span>
              {isOnSale ? <span className="sale-badge">Sale</span> : null}
            </div>
          ) : null}

          <ul className="pdp-chips" aria-label="Why buy here">
            {trustChips(shopInfo).map((chip) => <li key={chip}>{chip}</li>)}
          </ul>

          {condition ? <p className="pdp-condition"><span className="sale-badge">{condition}</span></p> : null}

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
                <span>{sized ? (luxe && product.variants.some((v) => /^EUR\s/i.test(variantLabel(v))) ? 'Size (EU)' : 'Size') : 'Option'}</span>
                {chosen ? <span className="selected-value">{luxe ? shortSize(variantLabel(chosen)) : variantLabel(chosen)}</span> : null}
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
                    {luxe ? shortSize(variantLabel(v)) : variantLabel(v)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {chosen && chosen.stockOnHand > 0 ? <p className="pdp-stock-note">In stock</p> : null}
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

          <div className="pdp-actions" ref={actionsRef}>
            <button className="btn btn-primary btn-block" disabled={!chosen} onClick={addChosenToCart}>
              {addLabel}
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
                <WhatsAppIcon /> {chosen ? 'Order on WhatsApp' : sized ? 'Ask about sizes on WhatsApp' : 'Ask on WhatsApp'}
              </a>
            ) : null}
            {telHref(shopInfo.contactPhone) ? (
              <a className="btn btn-outline btn-block pdp-call-btn" href={telHref(shopInfo.contactPhone) as string} data-source="product-page">
                <PhoneIcon /> Call {shopInfo.contactPhone}
              </a>
            ) : null}
          </div>

          {luxe ? (
            <div>
              {product.description ? (
                <details className="pdp-acc" open>
                  <summary>Details</summary>
                  <div className="pdp-acc-body"><p className="pdp-description">{product.description}</p></div>
                </details>
              ) : null}
              {product.specs && product.specs.length > 0 ? (
                <details className="pdp-acc">
                  <summary>Specifications</summary>
                  <div className="pdp-acc-body">
                    <table>
                      <tbody>
                        {product.specs.map((row, i) => (
                          <tr key={`${row.label}-${i}`}><th scope="row">{row.label}</th><td>{row.value}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
              <details className="pdp-acc">
                <summary>Delivery &amp; help</summary>
                <div className="pdp-acc-body">
                  <ul>
                    {assurances(shopInfo).map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </div>
              </details>
            </div>
          ) : null}

          {/* The description sits under the buttons, not between the price and the sizes: a shopper who has decided should not scroll past a
              paragraph to reach them. */}
          {product.description && !luxe ? <p className="pdp-description pdp-description-below">{product.description}</p> : null}

          {luxe ? null : (
            <ul className="pdp-assurances">
              {assurances(shopInfo).map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
        </div>
      </div>

      {product.specs && product.specs.length > 0 && !luxe ? (
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
          <h2>{luxe ? 'You may also like' : 'You might also like'}</h2>
          <div className="product-grid">
            {product.related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Phones only (see globals.css). The same actions as the buttons above, kept in reach while those are out of view. */}
      {barOn ? (
        <div className="buybar" role="region" aria-label="Buy this item">
          {added || cart.count > 0 ? (
            <Link href="/cart" className="buybar-strip">
              <span>{added ? (luxe ? 'Added to your bag' : 'Added to your cart') : `${cart.count} item${cart.count === 1 ? '' : 's'} in your ${luxe ? 'bag' : 'cart'}`}</span>
              <strong>Checkout &rarr;</strong>
            </Link>
          ) : null}
          <div className="buybar-row">
            <div className="buybar-price">
              <strong>{chosen ? `KES ${Number(chosen.priceKes).toLocaleString()}` : 'Select an option'}</strong>
              {chosen && sized ? <span>Size {shortSize(variantLabel(chosen))}</span> : null}
            </div>
            <button type="button" className="buybar-add btn btn-primary" disabled={!chosen} onClick={addChosenToCart}>
              {added ? 'Added' : chosen ? (luxe ? 'Add to bag' : 'Add to cart') : sized ? 'Select a size' : 'Select an option'}
            </button>
            {whatsappHref ? (
              <a
                className="buybar-icon buybar-wa"
                href={whatsappHref}
                suppressHydrationWarning
                target="_blank"
                rel="noreferrer"
                aria-label="Order on WhatsApp"
                onClick={() => {
                  track('WHATSAPP_CLICK', { productSlug: product.slug, detail: 'product-bar' });
                  fireAdEvent('contact', { ids: chosen?.sku ? [chosen.sku] : undefined, name: product.name, value: chosen ? Number(chosen.priceKes) : undefined });
                }}
              >
                <WhatsAppIcon />
              </a>
            ) : null}
            {telHref(shopInfo.contactPhone) ? (
              <a className="buybar-icon buybar-call" href={telHref(shopInfo.contactPhone) as string} data-source="product-bar" aria-label={`Call ${shopInfo.contactPhone}`}>
                <PhoneIcon />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
