"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';

type Issue = {
  code: string;
  severity: 'problem' | 'tip';
  title: string;
  hint: string;
  products: { id: string; name: string; detail?: string }[];
};
type Health = { checked: number; clean: number; issues: Issue[] };

const SHOWN = 8;

// The checks a person would otherwise do by scrolling every product: a mistyped price, a size in the
// name, two products sharing a photo, blank brands. Only live products are checked.
export default function CatalogHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function load() {
    setError(null);
    const res = await portalFetch('/portal/catalog-health');
    if (res.ok) setHealth(await res.json());
    else setError('Could not run the check. Try again.');
  }
  useEffect(() => { load(); }, []);

  if (error) return <div className="portal-alert is-error">{error}</div>;
  if (!health) return <p>Checking your products...</p>;

  const problems = health.issues.filter((i) => i.severity === 'problem');
  const tips = health.issues.filter((i) => i.severity === 'tip');

  function renderIssue(issue: Issue) {
    const expanded = open[issue.code];
    const rows = expanded ? issue.products : issue.products.slice(0, SHOWN);
    return (
      <div key={issue.code} className="portal-card" style={{ marginBottom: 12 }}>
        <h4 style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {issue.title}
          {issue.products.length > 0 ? <span className={`portal-badge ${issue.severity === 'problem' ? 'is-cancelled' : 'is-pending'}`}>{issue.products.length}</span> : null}
        </h4>
        <p style={{ color: 'var(--p-muted)', fontSize: 13, margin: '0 0 8px', maxWidth: 640 }}>{issue.hint}</p>
        {issue.code === 'no-categories' ? <Link href="/portal/categories" className="portal-btn-outline portal-btn portal-btn-sm">Add categories</Link> : null}
        {rows.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rows.map((p) => (
              <li key={p.id} style={{ padding: '6px 0', borderTop: '1px solid var(--p-border, #eee)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span>
                  <Link href={`/portal/products/${p.id}`}><strong>{p.name}</strong></Link>
                  {p.detail ? <span style={{ color: 'var(--p-muted)', fontSize: 13 }}> &middot; {p.detail}</span> : null}
                </span>
                <Link href={`/portal/products/${p.id}`} className="portal-btn-outline portal-btn portal-btn-sm">Fix</Link>
              </li>
            ))}
          </ul>
        ) : null}
        {issue.products.length > SHOWN ? (
          <button type="button" className="portal-btn-ghost" style={{ marginTop: 6 }} onClick={() => setOpen((o) => ({ ...o, [issue.code]: !expanded }))}>
            {expanded ? 'Show fewer' : `Show all ${issue.products.length}`}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3>Catalog check</h3>
        <button type="button" className="portal-btn-outline portal-btn" onClick={load}>Check again</button>
      </div>
      <p style={{ color: 'var(--p-muted)', fontSize: 13, margin: '0 0 16px', maxWidth: 640 }}>
        Looks at your live products for the mistakes that cost sales or look unprofessional. Hidden products are not checked.
      </p>

      {health.checked === 0 ? (
        <div className="portal-empty">No live products yet. <Link href="/portal/products/new">Add your first product</Link>.</div>
      ) : health.issues.length === 0 ? (
        <div className="portal-alert is-success">All {health.checked} live products look good.</div>
      ) : (
        <>
          <div className={`portal-alert ${problems.length ? 'is-warn' : 'is-success'}`}>
            {health.clean} of {health.checked} live products have no problems.
            {problems.length ? ` Fix the ${problems.length} problem${problems.length === 1 ? '' : 's'} below first.` : ' The tips below are optional.'}
          </div>
          {problems.length ? <h4 style={{ margin: '16px 0 8px' }}>Problems</h4> : null}
          {problems.map(renderIssue)}
          {tips.length ? <h4 style={{ margin: '16px 0 8px' }}>Worth a look</h4> : null}
          {tips.map(renderIssue)}
        </>
      )}
    </div>
  );
}
