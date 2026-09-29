"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '../admin-api';

type UserRow = {
  id: string; email: string; firstName: string; lastName: string;
  isSuperAdmin: boolean; createdAt: string;
};

// Not an invite-by-email flow -- promoting someone who already has an
// account (usually already staff on some shop) is the common case here,
// see the batch-3 plan's own note on this. Search is required (capped at
// 50 results) rather than a full paginated listing of every User, since
// this is a lookup tool, not a user-management table.
export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [authFailed, setAuthFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const query = new URLSearchParams();
    if (search) query.set('search', search);
    const res = await adminFetch(`/admin/users?${query.toString()}`);
    if (res.status === 401) { setAuthFailed(true); return; }
    setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (authFailed) router.replace('/admin/login');
  }, [authFailed, router]);

  async function onToggleAdmin(user: UserRow) {
    const promoting = !user.isSuperAdmin;
    if (!promoting) {
      if (!window.confirm(`Remove platform-admin access from ${user.email}? They will no longer be able to log into the admin console.`)) return;
    }
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

  if (authFailed) return null;

  return (
    <div>
      <div className="admin-page-head"><h3>Platform admins</h3></div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }}
        >
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by name or email..."
            aria-label="Search users"
            style={{ flex: 1 }}
          />
          <button type="submit" className="admin-btn">Search</button>
          {search ? (
            <button type="button" className="admin-btn-ghost" onClick={() => { setSearchDraft(''); setSearch(''); }}>
              Clear
            </button>
          ) : null}
        </form>
      </div>

      {error ? <div className="admin-alert is-error">{error}</div> : null}

      {!users ? <p>Loading...</p> : users.length === 0 ? (
        <div className="admin-empty">{search ? 'No users match that search.' : 'Search for a user by name or email.'}</div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Created</th>
                <th>Admin?</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.firstName} {user.lastName}</td>
                  <td>{user.email}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`admin-badge ${user.isSuperAdmin ? 'is-active' : 'is-trial'}`}>
                      {user.isSuperAdmin ? 'Admin' : 'No'}
                    </span>
                  </td>
                  <td>
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
      {loading && users ? <p style={{ color: 'var(--a-muted)', fontSize: 13, marginTop: 8 }}>Loading...</p> : null}
    </div>
  );
}
