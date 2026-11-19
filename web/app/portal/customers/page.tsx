"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';
import { downloadFile, today } from '../download';
import { useSession } from '../portal-session';
import { Pager, SearchField, SortHeader, SortSelect, useListState } from '../list-kit';

type Customer = {
  key: string; hasAccount: boolean; name: string; email: string | null; phone: string | null;
  firstSeenAt: string; lastOrderAt: string | null; orderCount: number; paidOrderCount: number; lifetimeValueKes: number;
};

const SORTS = [
  { value: 'recent', label: 'Most recent' }, { value: 'spent', label: 'Highest spend' }, { value: 'orders', label: 'Most orders' },
  { value: 'name', label: 'Name A to Z' }, { value: 'oldest', label: 'Longest since last order' },
];
const muted = { color: 'var(--p-muted)' } as const;

// Everyone who has bought from the shop or has an account -- guests and people
// ordering over WhatsApp included, matched by email or phone so one person
// who ordered three times is one row.
export default function CustomersPage() {
  const { isOwner } = useSession();
  const { state, set, reset, ready, dirty } = useListState({}, { sort: 'recent' });
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(state.page), pageSize: String(state.size), sort: state.sort });
    if (state.q) query.set('search', state.q);
    const res = await portalFetch(`/portal/customers?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.customers);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
  }, [state.page, state.size, state.sort, state.q]);
  useEffect(() => { if (ready) void load(); }, [ready, load]);

  async function onExport() {
    const query = new URLSearchParams({ sort: state.sort });
    if (state.q) query.set('search', state.q);
    setExporting(true);
    setError(await downloadFile(`/portal/customers/export-csv?${query.toString()}`, `customers-${today()}.csv`));
    setExporting(false);
  }

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3>Customers</h3>
          <p style={{ fontSize: 13, ...muted }}>{customers === null ? 'Loading...' : `${total.toLocaleString()} customer${total === 1 ? '' : 's'}`}</p>
        </div>
        {isOwner ? <button type="button" className="portal-btn-outline portal-btn" disabled={exporting || total === 0} onClick={onExport}>{exporting ? 'Preparing...' : 'Export CSV'}</button> : null}
      </div>
      {error ? <div className="portal-alert is-error">{error}</div> : null}

      <div className="portal-card" style={{ marginBottom: 14 }}>
        <div className="lk-toolbar">
          <SearchField value={state.q} onChange={(q) => set({ q })} placeholder="Name, email or phone" label="Search customers" />
          <SortSelect value={state.sort} onChange={(sort) => set({ sort })} options={SORTS} />
        </div>
        {dirty ? <div style={{ marginTop: 10 }}><button type="button" className="portal-btn-ghost" onClick={reset}>Clear search</button></div> : null}
      </div>

      {!customers ? <p>Loading...</p> : customers.length === 0 ? (
        <div className="portal-empty">{dirty ? 'No customers match that search.' : 'No customers yet. They appear here after their first order.'}</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="portal-table">
            <thead><tr>
              <SortHeader label="Name" asc="name" desc="name" sort={state.sort} onSort={(sort) => set({ sort })} />
              <th>Contact</th>
              <SortHeader label="Last order" asc="oldest" desc="recent" sort={state.sort} onSort={(sort) => set({ sort })} />
              <SortHeader label="Orders" asc="orders" desc="orders" sort={state.sort} onSort={(sort) => set({ sort })} />
              <SortHeader label="Spent" asc="spent_asc" desc="spent" sort={state.sort} onSort={(sort) => set({ sort })} />
            </tr></thead>
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

      <Pager page={state.page} pageSize={state.size} total={total} totalPages={totalPages} onPage={(page) => set({ page })} onSize={(size) => set({ size })} />
    </div>
  );
}
