"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '../admin-api';
import { ago } from '../format';
import { Pagination } from '../pagination';

type UserRow = {
  id: string; email: string; firstName: string; lastName: string;
  isSuperAdmin: boolean; createdAt: string; lastLoginAt: string | null;
  shops: { id: string; name: string; slug: string; role: 'OWNER' | 'STAFF' }[];
};

const muted = { color: 'var(--a-muted)' } as const;

// Everyone with a login, with the shops they belong to and when they last
// signed in. Promoting someone who already has an account (usually staff on
// some shop) is the common way to make a platform admin, not an invite.
export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [onlyAdmins, setOnlyAdmins] = useState(false);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    const query = new URLSearchParams({ page: String(page) });
    if (search) query.set('search', search);
    if (onlyAdmins) query.set('admin', 'true');
    const res = await adminFetch(`/admin/users?${query.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    setUsers(data.users); setTotal(data.total); setTotalPages(data.totalPages);
  }
  useEffect(() => { load(); }, [search, onlyAdmins, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onToggleAdmin(user: UserRow) {
    const promoting = !user.isSuperAdmin;
    if (!promoting && !window.confirm(`Remove platform-admin access from ${user.email}? They will no longer be able to log into the admin console.`)) return;
    setError(null);
    setBusyId(user.id);
    try {
      const res = await adminFetch(`/admin/users/${user.id}/super-admin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSuperAdmin: promoting }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not update this user');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function onSendReset(user: UserRow) {
    if (!window.confirm(`Email a password-reset link to ${user.email}? The link goes to their inbox only; you won't see it.`)) return;
    setNotice(null);
    setBusyId(user.id);
    const res = await adminFetch(`/admin/users/${user.id}/send-reset`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    setBusyId(null);
    setNotice(res.ok ? { ok: data.sent, text: data.message } : { ok: false, text: data?.message || 'Could not send the reset link' });
  }

  return (
    <div>
      <div className="admin-page-head"><h3>Users</h3></div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <form style={{ display: 'flex', gap: 8, marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); setPage(1); }}>
          <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search by name or email..." aria-label="Search users" style={{ flex: 1 }} />
          <button type="submit" className="admin-btn">Search</button>
          {search ? <button type="button" className="admin-btn-ghost" onClick={() => { setSearchDraft(''); setSearch(''); setPage(1); }}>Clear</button> : null}
        </form>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={onlyAdmins} onChange={(e) => { setOnlyAdmins(e.target.checked); setPage(1); }} style={{ width: 'auto' }} />
            Platform admins only
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 13, ...muted }}>{users ? `${total} user${total === 1 ? '' : 's'}` : 'Loading...'}</span>
        </div>
      </div>

      {error ? <div className="admin-alert is-error">{error}</div> : null}
      {notice ? <div className={`admin-alert ${notice.ok ? 'is-success' : 'is-error'}`}>{notice.text}</div> : null}

      {!users ? <p>Loading...</p> : users.length === 0 ? (
        <div className="admin-empty">{search || onlyAdmins ? 'No users match that.' : 'No users yet.'}</div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>Person</th><th>Shops</th><th>Last login</th><th>Admin?</th><th></th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.firstName} {user.lastName}</strong>
                    <div style={{ fontSize: 12, ...muted }}>{user.email}</div>
                  </td>
                  <td>
                    {user.shops.length === 0 ? <span style={muted}>&mdash;</span> : user.shops.map((s) => (
                      <div key={s.id} style={{ fontSize: 13 }}>
                        <Link href={`/admin/shops/${s.id}`}>{s.name}</Link> <span style={{ ...muted, fontSize: 12 }}>{s.role.toLowerCase()}</span>
                      </div>
                    ))}
                  </td>
                  <td style={user.lastLoginAt ? undefined : muted} title={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : undefined}>{ago(user.lastLoginAt)}</td>
                  <td><span className={`admin-badge ${user.isSuperAdmin ? 'is-active' : 'is-trial'}`}>{user.isSuperAdmin ? 'Admin' : 'No'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="admin-btn-ghost" onClick={() => onSendReset(user)} disabled={busyId === user.id}>Send reset link</button>
                    <button
                      className={user.isSuperAdmin ? 'admin-btn-ghost' : 'admin-btn-outline admin-btn admin-btn-sm'}
                      onClick={() => onToggleAdmin(user)}
                      disabled={busyId === user.id}
                    >
                      {busyId === user.id ? 'Saving...' : user.isSuperAdmin ? 'Remove admin' : 'Make admin'}
                    </button>
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
