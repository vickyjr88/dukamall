"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';
import { downloadFile, today } from '../download';
import { useSession } from '../portal-session';

type Customer = {
  key: string; hasAccount: boolean; name: string; email: string | null; phone: string | null;
  firstSeenAt: string; lastOrderAt: string | null; orderCount: number; paidOrderCount: number; lifetimeValueKes: number;
};
type Sort = 'recent' | 'spent' | 'orders';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const SORT_LABEL: Record<Sort, string> = { recent: 'Most recent', spent: 'Highest spend', orders: 'Most orders' };
const muted = { color: 'var(--p-muted)' } as const;

// Everyone who has bought from the shop or has an account -- guests and people
// ordering over WhatsApp included, matched by email or phone so one person
// who ordered three times is one row.
export default function CustomersPage() {
  const { isOwner } = useSession();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
    if (search) query.set('search', search);
    const res = await portalFetch(`/portal/customers?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.customers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
  }
  useEffect(() => { load(); }, [search, sort, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onExport() {
    const query = new URLSearchParams({ sort });
    if (search) query.set('search', search);
    setExporting(true);
    setError(await downloadFile(`/portal/customers/export-csv?${query.toString()}`, `customers-${today()}.csv`));
    setExporting(false);
  }

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3>Customers</h3>
        {isOwner ? <button type="button" className="portal-btn-outline portal-btn" disabled={exporting || total === 0} onClick={onExport}>{exporting ? 'Preparing...' : 'Export CSV'}</button> : null}
      </div>
      {error ? <div className="portal-alert is-error">{error}</div> : null}

      <div className="portal-card" style={{ marginBottom: 16 }}>
        <form style={{ display: 'flex', gap: 8, marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}>
          <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search by name, email or phone..." aria-label="Search customers" style={{ flex: 1 }} />
          <button type="submit" className="portal-btn">Search</button>
          {search ? <button type="button" className="portal-btn-ghost" onClick={() => { setSearchDraft(''); setSearch(''); setPage(1); }}>Clear</button> : null}
        </form>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <label className="po-filter">
            Sort by
            <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setPage(1); }} style={{ minWidth: 140 }}>
              {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="po-filter">
            Per page
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ minWidth: 90 }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 13, ...muted }}>{customers === null ? 'Loading...' : `${total} customer${total === 1 ? '' : 's'}`}</span>
        </div>
      </div>

      {!customers ? <p>Loading...</p> : customers.length === 0 ? (
        <div className="portal-empty">{search ? 'No customers match that search.' : 'No customers yet. They appear here after their first order.'}</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="portal-table">
            <thead><tr><th>Name</th><th>Contact</th><th>Last order</th><th>Orders</th><th>Spent</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.key}>
                  <td>
                    <Link href={`/portal/customers/${encodeURIComponent(c.key)}`}><strong>{c.name || 'No name'}</strong></Link>
                    <div><span className={`portal-badge ${c.hasAccount ? 'is-info' : 'is-muted'}`}>{c.hasAccount ? 'Account' : 'Guest'}</span></div>
                  </td>
                  <td>
                    {c.email ?? <span style={muted}>&mdash;</span>}
                    {c.phone ? <div style={{ fontSize: 12, ...muted }}>{c.phone}</div> : null}
                  </td>
                  <td>{c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : <span style={muted}>Never</span>}</td>
                  <td>{c.orderCount}</td>
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
  for (const p of sorted) { if (p - prev > 1) items.push('ellipsis'); items.push(p); prev = p; }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      {items.map((item, i) =>
        item === 'ellipsis' ? <span key={`e${i}`} style={{ padding: '0 4px', ...muted }}>&hellip;</span> : (
          <button key={item} className={item === page ? 'portal-btn portal-btn-sm' : 'portal-btn-outline portal-btn portal-btn-sm'} onClick={() => onChange(item)} aria-current={item === page ? 'page' : undefined}>{item}</button>
        ),
      )}
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}
