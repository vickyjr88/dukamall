"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { Pagination } from '../pagination';

type EmailRow = {
  id: string; createdAt: string; to: string; subject: string; status: 'SENT' | 'FAILED' | 'SKIPPED';
  error: string | null; kind: string | null; shop: { id: string; name: string } | null;
};

const BADGE: Record<EmailRow['status'], string> = { SENT: 'is-active', FAILED: 'is-suspended', SKIPPED: 'is-trial' };
const KIND_LABEL: Record<string, string> = {
  order: 'Order confirmation', alert: 'Merchant alert', invite: 'Staff invite', reset: 'Password reset', shop_status: 'Shop status', test: 'Test',
};

// Whether the platform's email is really getting out. Failures were previously
// only a line in the server log, so a broken SMTP login meant order alerts,
// invites and password resets silently going nowhere.
export default function EmailLogPage() {
  const [rows, setRows] = useState<EmailRow[] | null>(null);
  const [tally, setTally] = useState({ sent: 0, failed: 0, skipped: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const query = new URLSearchParams({ page: String(page) });
    if (status) query.set('status', status);
    if (kind) query.set('kind', kind);
    if (search) query.set('search', search);
    adminFetch(`/admin/email-log?${query.toString()}`).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setRows(data.emails); setTotal(data.total); setTotalPages(data.totalPages); setTally(data.last7Days);
    });
  }, [status, kind, search, page]);

  const problems = tally.failed + tally.skipped;

  return (
    <div>
      <div className="admin-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3>Email log</h3>
        <Link href="/admin/settings" className="admin-btn-outline admin-btn">Email settings &amp; test</Link>
      </div>

      <div className="admin-stat-row">
        <div className="admin-stat"><div className="label">Sent (7 days)</div><div className="value">{tally.sent}</div></div>
        <div className="admin-stat"><div className="label">Failed (7 days)</div><div className="value" style={tally.failed ? { color: 'var(--a-danger)' } : undefined}>{tally.failed}</div></div>
        <div className="admin-stat"><div className="label">Not sent, no SMTP (7 days)</div><div className="value" style={tally.skipped ? { color: 'var(--a-warn)' } : undefined}>{tally.skipped}</div></div>
      </div>
      {problems > 0 ? (
        <div className="admin-alert is-warning">
          {tally.skipped > 0 ? 'Some email was not sent because email (SMTP) is not configured. ' : ''}
          {tally.failed > 0 ? 'Some email failed to send; the error is shown on each row. ' : ''}
          Order alerts, staff invites and password resets depend on this working. <Link href="/admin/settings">Check the settings</Link>.
        </div>
      ) : null}

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <form style={{ display: 'flex', gap: 8, marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}>
          <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search by recipient or subject..." aria-label="Search email log" style={{ flex: 1 }} />
          <button type="submit" className="admin-btn">Search</button>
          {search ? <button type="button" className="admin-btn-ghost" onClick={() => { setSearchDraft(''); setSearch(''); setPage(1); }}>Clear</button> : null}
        </form>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="admin-filter">Result
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={{ minWidth: 140 }}>
              <option value="">All</option><option value="SENT">Sent</option><option value="FAILED">Failed</option><option value="SKIPPED">Not sent (no SMTP)</option>
            </select>
          </label>
          <label className="admin-filter">Type
            <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }} style={{ minWidth: 170 }}>
              <option value="">All</option>
              {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--a-muted)' }}>{rows ? `${total} email${total === 1 ? '' : 's'}` : 'Loading...'}</span>
        </div>
      </div>

      {!rows ? <p>Loading...</p> : rows.length === 0 ? (
        <div className="admin-empty">{status || kind || search ? 'No email matches those filters.' : 'No email has been sent yet. Emails are kept for 90 days.'}</div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Type</th><th>Shop</th><th>Result</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.to}</td>
                  <td>{r.subject}</td>
                  <td>{r.kind ? KIND_LABEL[r.kind] ?? r.kind : <span style={{ color: 'var(--a-muted)' }}>&mdash;</span>}</td>
                  <td>{r.shop ? <Link href={`/admin/shops/${r.shop.id}`}>{r.shop.name}</Link> : <span style={{ color: 'var(--a-muted)' }}>&mdash;</span>}</td>
                  <td>
                    <span className={`admin-badge ${BADGE[r.status]}`}>{r.status === 'SKIPPED' ? 'Not sent' : r.status === 'SENT' ? 'Sent' : 'Failed'}</span>
                    {r.error ? <div style={{ fontSize: 12, color: 'var(--a-muted)', maxWidth: 280, whiteSpace: 'normal' }}>{r.error}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
