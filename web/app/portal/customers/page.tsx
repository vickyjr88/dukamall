"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type Customer = {
  id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null;
  createdAt: string; paidOrderCount: number; lifetimeValueKes: number;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load() {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) query.set('search', search);
    const res = await portalFetch(`/portal/customers?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.customers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
  }

  useEffect(() => { load(); }, [search, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="portal-page-head"><h3>Customers</h3></div>

      <div className="portal-card" style={{ marginBottom: 16 }}>
        <form
          style={{ display: 'flex', gap: 8, marginBottom: 14 }}
          onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}
        >
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by name, email or phone..."
            aria-label="Search customers"
            style={{ flex: 1 }}
          />
          <button type="submit" className="portal-btn">Search</button>
          {search ? (
            <button type="button" className="portal-btn-ghost" onClick={() => { setSearchDraft(''); setSearch(''); setPage(1); }}>
              Clear
            </button>
          ) : null}
        </form>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
            Per page
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ minWidth: 90 }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--p-muted)' }}>
            {customers === null ? 'Loading...' : `${total} customer${total === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {!customers ? <p>Loading...</p> : customers.length === 0 ? (
        <div className="portal-empty">{search ? 'No customers match that search.' : 'No customer accounts yet.'}</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="portal-table">
            <thead>
              <tr><th>Name</th><th>Contact</th><th>Joined</th><th>Paid orders</th><th>Lifetime value</th></tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>{[c.firstName, c.lastName].filter(Boolean).join(' ') || <span style={{ color: 'var(--p-muted)' }}>No name</span>}</td>
                  <td>
                    {c.email ?? <span style={{ color: 'var(--p-muted)' }}>&mdash;</span>}
                    {c.phone ? <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{c.phone}</div> : null}
                  </td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>{c.paidOrderCount}</td>
                  <td>KES {c.lifetimeValueKes.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onChange={setPage} /> : null}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = Array.from(pages).sort((a, b) => a - b);

  const items: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push('ellipsis');
    items.push(p);
    prev = p;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20 }}>
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {items.map((item, i) =>
        item === 'ellipsis' ? (
          <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--p-muted)' }}>&hellip;</span>
        ) : (
          <button
            key={item}
            className={item === page ? 'portal-btn portal-btn-sm' : 'portal-btn-outline portal-btn portal-btn-sm'}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
