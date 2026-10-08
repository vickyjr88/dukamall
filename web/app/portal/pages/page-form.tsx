"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { portalFetch } from '../portal-api';
import { RichText } from '../../lib/rich-text';
import { slugify } from '../products/product-types';

export type ApiPage = { id: string; slug: string; title: string; body: string; published: boolean; showInFooter: boolean };

/** Create (no `page`) or edit one content page, with a live preview of how the text will render. */
export function PageForm({ page }: { page?: ApiPage }) {
  const router = useRouter();
  const editing = Boolean(page);
  const [title, setTitle] = useState(page?.title ?? '');
  const [slug, setSlug] = useState(page?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [body, setBody] = useState(page?.body ?? '');
  const [published, setPublished] = useState(page?.published ?? true);
  const [showInFooter, setShowInFooter] = useState(page?.showInFooter ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(false);

  // The address follows the title on a new page until it's edited by hand; an
  // existing page's address is never rewritten (links to it may be out there).
  useEffect(() => {
    if (!editing && !slugTouched) setSlug(slugify(title).slice(0, 60));
  }, [title, slugTouched, editing]);

  const snapshot = useMemo(() => JSON.stringify({ title, slug, body, published, showInFooter }), [title, slug, body, published, showInFooter]);
  const baseline = useRef<string | null>(null);
  if (baseline.current === null) baseline.current = snapshot;
  const dirty = snapshot !== baseline.current;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Give the page a title.'); return; }
    setSaving(true);
    setError(null);
    setSavedAt(false);
    const payload = { title: title.trim(), body, published, showInFooter, ...(slug.trim() ? { slug: slug.trim() } : {}) };
    const res = await portalFetch(editing ? `/portal/pages/${page!.id}` : '/portal/pages', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Could not save this page');
      return;
    }
    baseline.current = snapshot;
    if (editing) { setSavedAt(true); return; }
    const created = await res.json();
    router.push(`/portal/pages/${created.id}`);
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="portal-page-head"><h3>{editing ? 'Edit page' : 'New page'}</h3></div>
      <div className="pe-layout">
        <div className="pe-main">
          <div className="portal-card">
            <div className="portal-field">
              <label htmlFor="pg-title">Title</label>
              <input id="pg-title" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Delivery & returns" />
            </div>
            <div className="portal-field">
              <label htmlFor="pg-slug">Web address</label>
              <div className="pe-slug">
                <span>/pages/</span>
                <input id="pg-slug" maxLength={60} value={slug} onChange={(e) => { setSlug(slugify(e.target.value).slice(0, 60)); setSlugTouched(true); }} />
              </div>
              {editing ? <span className="hint">Changing this breaks any link you have already shared.</span> : null}
            </div>
            <div className="portal-field">
              <label htmlFor="pg-body">Text</label>
              <textarea id="pg-body" rows={16} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} style={{ fontFamily: 'inherit' }} />
              <span className="hint">
                Blank line = new paragraph. <code>## Heading</code>, <code>- bullet</code>, <code>1. numbered</code>, <code>**bold**</code>, <code>[link text](https://...)</code>.
              </span>
            </div>
          </div>
          <div className="portal-card">
            <h4>Preview</h4>
            {body.trim() ? <RichText text={body} className="portal-prose" /> : <p style={{ color: 'var(--p-muted)', margin: 0 }}>Start typing to see how it will look.</p>}
          </div>
        </div>

        <aside className="pe-side">
          <div className="portal-card">
            <h4>Visibility</h4>
            <label className="pe-check">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              <span>Published<br /><span className="hint">Drafts can&apos;t be seen by shoppers.</span></span>
            </label>
            <label className="pe-check">
              <input type="checkbox" checked={showInFooter} onChange={(e) => setShowInFooter(e.target.checked)} />
              <span>Link in the footer<br /><span className="hint">Only when published.</span></span>
            </label>
            {editing && published ? <a href={`/pages/${page!.slug}`} target="_blank" rel="noopener noreferrer">View live page</a> : null}
          </div>
        </aside>
      </div>

      {error ? <div className="portal-alert is-error" style={{ marginBottom: 80 }}>{error}</div> : null}
      <div className="pe-actionbar">
        <span style={{ fontSize: 13, color: dirty ? 'var(--p-warn)' : 'var(--p-muted)' }}>{dirty ? 'Unsaved changes' : savedAt ? 'Saved' : ''}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/portal/pages" className="portal-btn-outline portal-btn">{editing ? 'Back' : 'Cancel'}</Link>
          <button type="submit" className="portal-btn" disabled={saving || (editing && !dirty)}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Create page'}</button>
        </div>
      </div>
    </form>
  );
}
