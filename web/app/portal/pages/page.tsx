"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';

type PageRow = { id: string; slug: string; title: string; published: boolean; showInFooter: boolean; position: number };

const STARTER_SLUGS = ['delivery-and-returns', 'about-us', 'contact', 'privacy-policy'];

// Shopper-facing content pages: delivery & returns, about, contact, privacy.
// They're linked from the storefront footer and listed in the sitemap.
export default function PagesList() {
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await portalFetch('/portal/pages');
    if (res.ok) setPages(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function call(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    const res = await portalFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'That did not work');
      return false;
    }
    await load();
    return true;
  }

  async function remove(page: PageRow) {
    if (!window.confirm(`Delete "${page.title}"? Shoppers following a link to it will see a "page not found" message.`)) return;
    await call(`/portal/pages/${page.id}`, 'DELETE');
  }

  if (!pages) return <p>Loading...</p>;
  const missingStarters = STARTER_SLUGS.some((slug) => !pages.some((p) => p.slug === slug));

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3>Pages</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {missingStarters ? (
            <button type="button" className="portal-btn-outline portal-btn" disabled={busy} onClick={() => call('/portal/pages/starters', 'POST')}>Add starter pages</button>
          ) : null}
          <Link href="/portal/pages/new" className="portal-btn">New page</Link>
        </div>
      </div>
      <p style={{ color: 'var(--p-muted)', fontSize: 13, margin: '0 0 16px', maxWidth: 640 }}>
        Pages like delivery &amp; returns, about us and your privacy policy. Published pages appear in your storefront footer.
        {missingStarters ? ' "Add starter pages" creates drafts with placeholder wording for you to edit -- nothing goes live until you publish it.' : ''}
      </p>
      {error ? <div className="portal-alert is-error">{error}</div> : null}

      {pages.length === 0 ? (
        <div className="portal-empty">No pages yet. Add the starter pages, or write your own.</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="portal-table">
            <thead><tr><th>Page</th><th>Status</th><th>In footer</th><th>Order</th><th></th></tr></thead>
            <tbody>
              {pages.map((page, index) => (
                <tr key={page.id}>
                  <td>
                    <Link href={`/portal/pages/${page.id}`}><strong>{page.title}</strong></Link>
                    <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>/pages/{page.slug}</div>
                  </td>
                  <td><span className={`portal-badge ${page.published ? 'is-paid' : 'is-muted'}`}>{page.published ? 'Published' : 'Draft'}</span></td>
                  <td>{page.showInFooter ? 'Yes' : 'No'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="portal-btn-ghost" disabled={busy || index === 0} aria-label={`Move ${page.title} up`} onClick={() => call(`/portal/pages/${page.id}/move/up`, 'POST')}>&uarr;</button>
                    <button type="button" className="portal-btn-ghost" disabled={busy || index === pages.length - 1} aria-label={`Move ${page.title} down`} onClick={() => call(`/portal/pages/${page.id}/move/down`, 'POST')}>&darr;</button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link href={`/portal/pages/${page.id}`} className="portal-btn-outline portal-btn portal-btn-sm">Edit</Link>{' '}
                    {page.published ? <a href={`/pages/${page.slug}`} target="_blank" rel="noopener noreferrer" className="portal-btn-outline portal-btn portal-btn-sm">View</a> : null}{' '}
                    <button type="button" className="portal-btn-ghost" disabled={busy} onClick={() => remove(page)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
