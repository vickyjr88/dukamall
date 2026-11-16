"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCustomerAuth } from '@/app/lib/customer-auth';
import { useCart } from '@/app/lib/cart';
import { useShopStyle } from '@/app/lib/style-context';
import { ShopCategory } from '@/app/lib/api';
import { ProductSearch } from '@/app/product-search';

const CartIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 6h15l-1.5 9h-12z" />
    <path d="M6 6 5 2H2" />
    <circle cx="9.5" cy="20" r="1" fill="currentColor" stroke="none" />
    <circle cx="17.5" cy="20" r="1" fill="currentColor" stroke="none" />
  </svg>
);

/** The luxury styles' bag: a slim shopping bag outline rather than a trolley. */
const BagIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 8h14l-1 12H6L5 8z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </svg>
);

const SearchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M5 5l14 14M19 5 5 19" />
  </svg>
);

/** How many category links the bar can carry before it stops being a bar. The rest are one click away under "Shop all". */
const MAX_NAV_CATEGORIES = 5;

export function StorefrontHeader({ shopName, logoUrl, categories = [] }: { shopName: string; logoUrl: string | null; categories?: ShopCategory[] }) {
  const { customer, ready } = useCustomerAuth();
  const cart = useCart();
  const { luxe } = useShopStyle();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [term, setTerm] = useState('');

  // One panel at a time, Escape closes it, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!searchOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSearchOpen(false); setMenuOpen(false); } };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [searchOpen, menuOpen]);

  // The cursor is in the search box as soon as the panel opens (after its fade starts, or the browser refuses to focus a hidden input).
  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => document.querySelector<HTMLInputElement>('.shop-search-sheet input')?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  const cartLink = (
    <Link href="/cart" className="shop-cart-badge" aria-label={`${luxe ? 'Bag' : 'Cart'}, ${cart.count} item${cart.count === 1 ? '' : 's'}`}>
      {luxe ? <BagIcon /> : <CartIcon />}
      {cart.ready && cart.count > 0 ? <span className="count">{cart.count}</span> : null}
    </Link>
  );
  const logo = (
    <Link className="logo" href="/">
      {logoUrl ? <img src={logoUrl} alt={shopName} /> : shopName}
    </Link>
  );

  if (!luxe) {
    return (
      <header className="shop-header">
        {logo}
        <div className="shop-header-actions">
          {!ready ? null : customer ? (
            <Link href="/account">{customer.email.split('@')[0]}</Link>
          ) : (
            <Link href="/account/login">Log in</Link>
          )}
          {cartLink}
        </div>
      </header>
    );
  }

  const navCategories = categories.slice(0, MAX_NAV_CATEGORIES);
  const closeAll = () => { setSearchOpen(false); setMenuOpen(false); };
  const runSearch = () => {
    const q = term.trim();
    closeAll();
    router.push(q ? `/?search=${encodeURIComponent(q)}#catalog` : '/#catalog');
  };

  return (
    <>
      <header className="shop-header">
        <div className="shop-header-left">
          <button type="button" className="shop-icon-btn shop-menu-btn" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M4 8h16M4 16h16" /></svg>
          </button>
          <nav className="shop-nav" aria-label="Shop">
            <Link href="/#catalog">Shop all</Link>
            {navCategories.map((c) => <Link key={c.slug} href={`/?category=${c.slug}#catalog`}>{c.name}</Link>)}
          </nav>
        </div>
        {logo}
        <div className="shop-header-actions">
          <button type="button" className="shop-icon-btn" aria-label="Search" onClick={() => { setMenuOpen(false); setSearchOpen(true); }}><SearchIcon /></button>
          {!ready ? null : customer ? (
            <Link href="/account" className="shop-login-link">{customer.email.split('@')[0]}</Link>
          ) : (
            <Link href="/account/login" className="shop-login-link">Log in</Link>
          )}
          {cartLink}
        </div>
      </header>

      <div className={`shop-search-sheet${searchOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Search" aria-hidden={!searchOpen}>
        <div className="shop-sheet-bar">
          <span className="eyebrow">Search</span>
          <button type="button" className="shop-icon-btn" aria-label="Close search" onClick={closeAll}><CloseIcon /></button>
        </div>
        {/* A tap on a suggestion opens that product, so the panel closes with it. */}
        <div className="shop-sheet-body" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) closeAll(); }}>
          {searchOpen ? (
            <form onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
              <ProductSearch value={term} onChange={setTerm} onSubmit={runSearch} placeholder={`Search ${shopName}`} />
            </form>
          ) : null}
        </div>
      </div>

      <div className={`shop-drawer${menuOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Menu" aria-hidden={!menuOpen}>
        <div className="shop-sheet-bar">
          <span className="eyebrow">Menu</span>
          <button type="button" className="shop-icon-btn" aria-label="Close menu" onClick={closeAll}><CloseIcon /></button>
        </div>
        <div className="shop-sheet-body" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) closeAll(); }}>
          <nav className="shop-drawer-links" aria-label="Menu">
            <Link href="/#catalog">Shop all</Link>
            {categories.map((c) => <Link key={c.slug} href={`/?category=${c.slug}#catalog`}>{c.name}</Link>)}
          </nav>
          <div className="shop-drawer-foot">
            {!ready ? null : customer ? <Link href="/account">My account</Link> : <Link href="/account/login">Log in or register</Link>}
            <Link href="/cart">Bag{cart.ready && cart.count > 0 ? ` (${cart.count})` : ''}</Link>
          </div>
        </div>
      </div>
    </>
  );
}
