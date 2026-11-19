"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';
import { Pager, SearchField, SortHeader, useLocalList } from '../list-kit';

type Category = { id: string; name: string; slug: string; isActive: boolean; section?: string | null; _count: { products: number } };

// Keep in step with SECTIONS in backend src/common/sections.ts (the portal's Sections screen reads the full list from the API).
const SECTION_LABELS: Array<[string, string]> = [['footwear', 'Shoes'], ['clothes', 'Clothes'], ['watches', 'Watches'], ['electronics', 'Electronics'], ['devices', 'Devices and accessories']];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const list = useLocalList(categories, {
    text: (c) => `${c.name} ${SECTION_LABELS.find(([k]) => k === c.section)?.[1] ?? ''}`,
    sort: 'name',
    sorts: {
      name: (a, b) => a.name.localeCompare(b.name),
      name_desc: (a, b) => b.name.localeCompare(a.name),
      products_desc: (a, b) => b._count.products - a._count.products || a.name.localeCompare(b.name),
      products_asc: (a, b) => a._count.products - b._count.products || a.name.localeCompare(b.name),
      section: (a, b) => (a.section ?? '~').localeCompare(b.section ?? '~') || a.name.localeCompare(b.name),
      section_desc: (a, b) => (b.section ?? '').localeCompare(a.section ?? '') || a.name.localeCompare(b.name),
    },
  });

  async function load() {
    const res = await portalFetch('/portal/categories');
    if (res.ok) setCategories(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await portalFetch('/portal/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ...(section ? { section } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not create this category');
      setName('');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onRename(id: string) {
    setError(null);
    const res = await portalFetch(`/portal/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data?.message || 'Could not rename this category');
      return;
    }
    setEditingId(null);
    await load();
  }

  async function onToggleActive(cat: Category) {
    await portalFetch(`/portal/categories/${cat.id}/active`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !cat.isActive }),
    });
    await load();
  }

  async function onDelete(cat: Category) {
    if (!window.confirm(`Delete "${cat.name}"? This can't be undone.`)) return;
    setError(null);
    const res = await portalFetch(`/portal/categories/${cat.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setError(data?.message || 'Could not delete this category');
      return;
    }
    await load();
  }

  return (
    <div>
      <div className="portal-page-head"><h3>Categories</h3></div>

      <form onSubmit={onCreate} className="portal-card" style={{ maxWidth: 680, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div className="portal-field" style={{ marginBottom: 0, flex: 1 }}>
          <label>New category name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sneakers" required />
        </div>
        <div className="portal-field" style={{ marginBottom: 0, flex: '0 0 190px' }}>
          <label>Section</label>
          <select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">None</option>
            {SECTION_LABELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <button type="submit" className="portal-btn" disabled={busy}>{busy ? 'Adding...' : 'Add category'}</button>
      </form>
      <p className="hint" style={{ maxWidth: 640, marginTop: -8, marginBottom: 16, fontSize: 13, color: 'var(--p-muted)' }}>
        A category&apos;s section decides the options its products come in (a phone: storage, colour, condition; a shirt: size). <a href="/portal/sections">Set up what you sell</a> to add a section&apos;s usual categories in one go.
      </p>

      {error ? <div className="portal-alert is-error" style={{ maxWidth: 480 }}>{error}</div> : null}

      {!categories ? <p>Loading...</p> : categories.length === 0 ? (
        <div className="portal-empty">No categories yet -- add one above to start organizing your products.</div>
      ) : (
        <>
        <div style={{ marginBottom: 12, maxWidth: 360 }}><SearchField value={list.q} onChange={list.setQ} placeholder="Search categories" label="Search categories" /></div>
        {list.rows.length === 0 ? <div className="portal-card portal-empty" style={{ maxWidth: 820 }}>No categories match that.</div> : (
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden', maxWidth: 820 }}>
          <table className="portal-table">
            <thead><tr>
              <SortHeader label="Name" asc="name" desc="name_desc" sort={list.sort} onSort={list.setSort} />
              <SortHeader label="Section" asc="section" desc="section_desc" sort={list.sort} onSort={list.setSort} />
              <SortHeader label="Products" asc="products_asc" desc="products_desc" sort={list.sort} onSort={list.setSort} />
              <th>Status</th><th />
            </tr></thead>
            <tbody>
              {list.rows.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    {editingId === cat.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: 160 }} autoFocus />
                        <button className="portal-btn portal-btn-sm" onClick={() => onRename(cat.id)}>Save</button>
                        <button className="portal-btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        {cat.name} <span style={{ color: 'var(--p-muted)', fontSize: 12 }}>({cat.slug})</span>
                      </>
                    )}
                  </td>
                  <td>
                    <select
                      value={cat.section ?? ''}
                      aria-label={`Section for ${cat.name}`}
                      onChange={async (e) => {
                        await portalFetch(`/portal/categories/${cat.id}/section`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section: e.target.value || null }) });
                        await load();
                      }}
                      style={{ width: 'auto', fontSize: 13 }}
                    >
                      <option value="">None</option>
                      {SECTION_LABELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </td>
                  <td>{cat._count.products}</td>
                  <td>
                    <span className={`portal-badge ${cat.isActive ? 'is-paid' : 'is-cancelled'}`}>
                      {cat.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {editingId !== cat.id ? (
                      <button className="portal-btn-ghost" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}>Rename</button>
                    ) : null}
                    <button className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => onToggleActive(cat)}>
                      {cat.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    {cat._count.products === 0 ? (
                      <button className="portal-btn-ghost" onClick={() => onDelete(cat)}>Delete</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <div style={{ maxWidth: 820 }}><Pager page={list.page} pageSize={list.size} total={list.total} totalPages={list.totalPages} onPage={list.setPage} onSize={list.setSize} /></div>
        </>
      )}
    </div>
  );
}
