"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';
import { OwnerOnlyNotice, useSession } from '../portal-session';
import type { SectionInfo } from '../products/product-types';

type Overview = { unsectioned: number; sections: SectionInfo[] };

/**
 * What the shop sells. A section is a kind of product (watches, clothes, electronics, devices and accessories, shoes): it
 * decides the options a product comes in (a phone has storage, colour and condition; a watch has none; a shirt has a size),
 * the specifications worth listing, and the categories to start with. Switching one on creates its starter categories;
 * switching it off only stops offering it, so nothing already in the shop is ever removed from here.
 */
export default function SectionsPage() {
  const { ready, isOwner } = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await portalFetch('/portal/sections');
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!ready) return <p>Loading...</p>;
  if (!isOwner) return <OwnerOnlyNotice what="change what the shop sells" />;

  async function set(section: SectionInfo, enabled: boolean) {
    setBusy(section.key);
    setError(null);
    setNotice(null);
    try {
      const names = picked[section.key];
      const res = await portalFetch(`/portal/sections/${section.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, ...(enabled && names ? { categories: names } : {}) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(' ') : body?.message || 'Could not save');
      setData(body.overview);
      setNotice(
        enabled
          ? `${section.label} is on.${body.created.length ? ` Added ${body.created.length} categor${body.created.length === 1 ? 'y' : 'ies'}.` : ''}${body.adopted.length ? ` ${body.adopted.join(', ')} ${body.adopted.length === 1 ? 'was' : 'were'} already in your shop and now follow${body.adopted.length === 1 ? 's' : ''} this section.` : ''}`
          : `${section.label} is off. Its categories and products are still in your shop.`,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="portal-page-head"><h3>What you sell</h3></div>
      <p style={{ color: 'var(--p-muted)', maxWidth: 640, marginBottom: 18 }}>
        Pick the kinds of product your shop sells. Each one sets up the right categories and the right options for its products:
        a phone comes in storage, colour and condition, a watch comes one way, a shirt comes in sizes.
      </p>
      {notice ? <div className="portal-alert is-success">{notice}</div> : null}
      {error ? <div className="portal-alert is-error">{error}</div> : null}
      {!data ? <p>Loading...</p> : null}

      <div className="sec-grid">
        {data?.sections.map((section) => {
          const names = picked[section.key] ?? section.categories.filter((c) => !c.exists || !c.inSection).map((c) => c.name);
          return (
            <div key={section.key} className={`portal-card sec-card${section.enabled ? ' is-on' : ''}`}>
              <div className="sec-head">
                <h4 style={{ margin: 0, textTransform: 'none', letterSpacing: 0, fontSize: '1.05rem', color: 'var(--p-ink)' }}>{section.label}</h4>
                {section.enabled ? <span className="portal-badge is-paid">On</span> : <span className="portal-badge is-muted">Off</span>}
              </div>
              <p className="sec-tag">{section.tagline}</p>
              <p className="sec-meta">
                {section.axes.length
                  ? <>Options: {section.axes.map((a) => `${a.label}${a.required ? ' (required)' : ''}`).join(', ')}</>
                  : <>No options: each product is one item.</>}
                {section.productCount ? <> &middot; {section.productCount} product{section.productCount === 1 ? '' : 's'}</> : null}
              </p>

              {!section.enabled ? (
                <details className="sec-cats">
                  <summary>Categories to add ({names.length})</summary>
                  <div className="sec-cat-list">
                    {section.categories.map((c) => (
                      <label key={c.slug} className="pe-check" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={names.includes(c.name)}
                          onChange={(e) => setPicked((cur) => ({ ...cur, [section.key]: e.target.checked ? [...names, c.name] : names.filter((n) => n !== c.name) }))}
                        />
                        <span>{c.name}{c.exists ? <span className="hint"> (you already have this)</span> : null}</span>
                      </label>
                    ))}
                  </div>
                </details>
              ) : (
                <ul className="sec-cat-have">
                  {section.categories.filter((c) => c.inSection).map((c) => <li key={c.slug}>{c.name}{c.products ? ` (${c.products})` : ''}</li>)}
                </ul>
              )}

              <div className="sec-actions">
                {section.enabled ? (
                  <>
                    <Link href="/portal/products/new" className="portal-btn portal-btn-sm">Add a product</Link>
                    <button type="button" className="portal-btn-outline portal-btn portal-btn-sm" disabled={busy === section.key} onClick={() => void set(section, false)}>Stop offering</button>
                  </>
                ) : (
                  <button type="button" className="portal-btn portal-btn-sm" disabled={busy === section.key} onClick={() => void set(section, true)}>
                    {busy === section.key ? 'Saving...' : 'We sell this'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {data && data.unsectioned > 0 ? (
        <p className="hint" style={{ marginTop: 14, color: 'var(--p-muted)', fontSize: 13 }}>
          You also have {data.unsectioned} categor{data.unsectioned === 1 ? 'y' : 'ies'} that are not in a section. They keep working as they always have, with sizes.
          Switching on a section whose category has the same name moves that category into it.
        </p>
      ) : null}
    </div>
  );
}
