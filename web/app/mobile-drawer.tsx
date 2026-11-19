"use client";

/**
 * The phone menu for both consoles (the merchant portal and the operator console): a slim top bar with a menu button, and the sidebar as a drawer that
 * slides in from the left over a dimmed page. On a wide screen none of this shows and the sidebar is the sidebar it always was.
 *
 * The drawer closes on a link, on a tap outside it, on Escape, and whenever the page changes. While it is open the page behind it does not scroll, focus moves
 * into it, and when it closes focus returns to the button that opened it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import './mobile-drawer.css';

export function useDrawer(pathname: string) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  const closer = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [open]);

  useEffect(() => {
    if (open) closer.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // Turning a phone sideways (or opening the page on a wide screen) must not leave the page locked.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 801px)');
    const onChange = () => { if (query.matches) setOpen(false); };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return { open, setOpen, close, opener, closer };
}

const Burger = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const Cross = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);

/** The bar at the top of a phone screen: the menu button, and the name of the page you are on. */
export function TopBar({ className, brand, title, drawerId, open, onOpen, openerRef }: {
  className: string; brand: string; title: string; drawerId: string; open: boolean; onOpen: () => void; openerRef: React.MutableRefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className={`mob-topbar ${className}`}>
      <button ref={openerRef} type="button" className="mob-burger" aria-label="Open menu" aria-expanded={open} aria-controls={drawerId} onClick={onOpen}><Burger /></button>
      <span className="mob-brand">{brand}</span>
      <span className="mob-title">{title}</span>
    </header>
  );
}

export function Backdrop({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <div className={`mob-backdrop${open ? ' is-open' : ''}`} onClick={onClose} aria-hidden="true" />;
}

export function CloseButton({ onClose, closeRef }: { onClose: () => void; closeRef: React.MutableRefObject<HTMLButtonElement | null> }) {
  return <button ref={closeRef} type="button" className="mob-close" aria-label="Close menu" onClick={onClose}><Cross /></button>;
}
