"use client";

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { adminFetch } from '../admin-api';
import { ACTION_LABEL, describeMetadata } from '../audit-labels';
import { Pagination } from '../pagination';

type Entry = {
  id: string; action: string; reason: string | null; metadata: unknown; createdAt: string;
  admin: { email: string } | null; shop: { id: string; name: string; slug: string } | null;
};

// Everything operators have done on the platform -- shop actions and the ones
// that belong to no shop (admin changes, logins, email settings).
function AuditContent() {
  const params = useSearchParams();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [admins, setAdmins] = useState<{ id: string; email: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [action, setAction] = useState('');
  const [adminId, setAdminId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  // Arriving from a shop's page filters to that shop.
  const shopId = params.get('shopId') ?? '';

  useEffect(() => {
    const query = new URLSearchParams({ page: String(page) });
    if (action) query.set('action', action);
    if (adminId) query.set('adminId', adminId);
    if (shopId) query.set('shopId', shopId);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    adminFetch(`/admin/audit?${query.toString()}`).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setEntries(data.entries); setTotal(data.total); setTotalPages(data.totalPages); setActions(data.actions); setAdmins(data.admins);
    });
  }, [action, adminId, shopId, from, to, page]);

  const filtered = Boolean(action || adminId || shopId || from || to);
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <div>
      <div className="admin-page-head"><h3>Activity log</h3></div>
      <p style={{ color: 'var(--a-muted)', fontSize: 13, margin: '0 0 16px' }}>Everything platform admins have done, newest first.</p>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <label className="admin-filter">Action
            <select value={action} onChange={(e) => reset(() => setAction(e.target.value))} style={{ minWidth: 190 }}>
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
            </select>
          </label>
          <label className="admin-filter">Admin
            <select value={adminId} onChange={(e) => reset(() => setAdminId(e.target.value))} style={{ minWidth: 190 }}>
              <option value="">Anyone</option>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
            </select>
          </label>
          <label className="admin-filter">From<input type="date" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} /></label>
          <label className="admin-filter">To<input type="date" value={to} onChange={(e) => reset(() => setTo(e.target.value))} /></label>
          {filtered ? <Link href="/admin/audit" className="admin-btn-ghost" onClick={() => { setAction(''); setAdminId(''); setFrom(''); setTo(''); setPage(1); }}>Clear filters</Link> : null}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--a-muted)' }}>{entries ? `${total} entr${total === 1 ? 'y' : 'ies'}` : 'Loading...'}</span>
        </div>
        {shopId ? <p style={{ fontSize: 12, color: 'var(--a-muted)', margin: '10px 0 0' }}>Showing one shop only.</p> : null}
      </div>

      {!entries ? <p>Loading...</p> : entries.length === 0 ? (
        <div className="admin-empty">{filtered ? 'No activity matches those filters.' : 'Nothing recorded yet.'}</div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>When</th><th>Action</th><th>Shop</th><th>By</th><th>Reason</th></tr></thead>
            <tbody>
              {entries.map((e) => {
                const detail = describeMetadata(e.action, e.metadata);
                return (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</td>
                    <td>
                      <span className={e.action === 'admin.login_failed' ? 'admin-badge is-suspended' : undefined}>{ACTION_LABEL[e.action] ?? e.action}</span>
                      {detail ? <div style={{ fontSize: 12, color: 'var(--a-muted)' }}>{detail}</div> : null}
                    </td>
                    <td>{e.shop ? <Link href={`/admin/shops/${e.shop.id}`}>{e.shop.name}</Link> : <span style={{ color: 'var(--a-muted)' }}>Platform</span>}</td>
                    <td>{e.admin?.email ?? <span style={{ color: 'var(--a-muted)' }}>Platform (automatic)</span>}</td>
                    <td>{e.reason ?? <span style={{ color: 'var(--a-muted)' }}>&mdash;</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

export default function AuditPage() {
  return <Suspense fallback={<p>Loading...</p>}><AuditContent /></Suspense>;
}
