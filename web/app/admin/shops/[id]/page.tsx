"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminFetch, ADMIN_API_BASE, adminAuthHeaders } from '../../admin-api';

type Theme = {
  primaryColor: string; accentColor: string; logoUrl: string | null;
  heroImageUrl: string | null; fontPairing: string; layoutPreset: string;
};
type StaffRow = { userId: string; role: 'OWNER' | 'STAFF'; user: { email: string; firstName: string; lastName: string } };
type AuditEntry = { id: string; action: string; reason: string | null; metadata: Record<string, unknown> | null; createdAt: string; admin: { email: string } };
type BillingPlan = 'TRIAL' | 'BASIC' | 'PRO';
type ShopDetail = {
  id: string; slug: string; name: string; customDomain: string | null;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED'; currency: string; whatsappNumber: string | null;
  pendingDomain: string | null; domainVerifiedAt: string | null; createdAt: string;
  paymentReady: boolean;
  billingPlan: BillingPlan; trialEndsAt: string | null; billingNotes: string | null; trialExpiringSoon: boolean;
  theme: Theme | null;
  staff: StaffRow[];
  orderSummary: { orderCount: number; paidOrderCount: number; totalRevenueKes: number };
  auditLog: AuditEntry[];
};

const BADGE_CLASS: Record<ShopDetail['status'], string> = { TRIAL: 'is-trial', ACTIVE: 'is-active', SUSPENDED: 'is-suspended' };

const ACTION_LABEL: Record<string, string> = {
  'shop.status_changed': 'Status changed',
  'shop.impersonated': 'Viewed as shop',
  'domain.force_verified': 'Domain force-verified',
  'domain.disconnected': 'Domain disconnected',
  'staff.invited': 'Staff invited',
  'staff.removed': 'Staff removed',
  'billing.updated': 'Billing updated',
  'shop.exported': 'Data exported',
};

// A plain <a href> can't carry the admin's Authorization header, so the
// export button fetches the file itself and hands the browser a Blob URL
// to download -- the same workaround any authenticated-file-download flow
// needs client-side.
async function downloadExport(shopId: string, slug: string) {
  const res = await fetch(`${ADMIN_API_BASE}/admin/shops/${shopId}/export`, { headers: adminAuthHeaders() });
  if (!res.ok) throw new Error('Could not export this shop\'s data');
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : `${slug}-export.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ShopDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domainBusy, setDomainBusy] = useState(false);
  const [staffForm, setStaffForm] = useState({ email: '', firstName: '', lastName: '', role: 'STAFF' as 'OWNER' | 'STAFF' });
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [invitedCredentials, setInvitedCredentials] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [billingForm, setBillingForm] = useState<{ billingPlan: BillingPlan; trialEndsAt: string; billingNotes: string }>({ billingPlan: 'TRIAL', trialEndsAt: '', billingNotes: '' });
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingSaved, setBillingSaved] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  async function load() {
    const res = await adminFetch(`/admin/shops/${params.id}`);
    if (res.status === 401) { router.replace('/admin/login'); return; }
    if (res.status === 404) { setNotFound(true); return; }
    const data: ShopDetail = await res.json();
    setShop(data);
    setBillingForm({
      billingPlan: data.billingPlan,
      trialEndsAt: data.trialEndsAt ? data.trialEndsAt.slice(0, 10) : '',
      billingNotes: data.billingNotes ?? '',
    });
  }

  useEffect(() => { load(); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onImpersonate() {
    if (!shop) return;
    setError(null);
    setImpersonating(true);
    try {
      const res = await adminFetch(`/admin/shops/${shop.id}/impersonate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not view as this shop');
      // Cross-origin: the admin console and a shop's own portal are
      // different hosts, so localStorage can't be set here directly for
      // that origin. The token rides in the URL *fragment* to a portal page
      // that stores it and redirects -- see portal/sso/page.tsx. A fragment
      // is never sent to the server, so unlike a query string it can't end up
      // in access logs or a Referer header.
      // A verified custom domain is the host that's actually configured to
      // resolve to this shop; only fall back to the platform subdomain when
      // there is none.
      const host = shop.customDomain || `${data.shopSlug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3203'}`;
      const portalBase = `${window.location.protocol}//${host}`;
      window.open(`${portalBase}/portal/sso#token=${encodeURIComponent(data.access_token)}`, '_blank', 'noopener');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImpersonating(false);
    }
  }

  async function onForceVerify() {
    if (!shop?.pendingDomain) return;
    if (!window.confirm(`Force-verify "${shop.pendingDomain}" without checking DNS? Only do this if you've confirmed the merchant controls this domain some other way (e.g. a support call).`)) return;
    const reason = window.prompt('Why is this being force-verified? (shown in the audit log)') || undefined;
    setDomainBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/admin/shops/${shop.id}/domain/force-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not force-verify this domain');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDomainBusy(false);
    }
  }

  async function onDisconnectDomain() {
    if (!shop) return;
    if (!window.confirm('Disconnect this domain? The shop will fall back to its platform subdomain.')) return;
    setDomainBusy(true);
    setError(null);
    try {
      await adminFetch(`/admin/shops/${shop.id}/domain`, { method: 'DELETE' });
      await load();
    } finally {
      setDomainBusy(false);
    }
  }

  async function onInviteStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setStaffError(null);
    setInvitedCredentials(null);
    setStaffBusy(true);
    try {
      const res = await adminFetch(`/admin/shops/${shop.id}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not add this staff member');
      if (data.temporaryPassword) setInvitedCredentials({ email: data.email, temporaryPassword: data.temporaryPassword });
      setStaffForm({ email: '', firstName: '', lastName: '', role: 'STAFF' });
      await load();
    } catch (e: any) {
      setStaffError(e.message);
    } finally {
      setStaffBusy(false);
    }
  }

  async function onRemoveStaff(userId: string) {
    if (!shop) return;
    if (!window.confirm('Remove this person\'s access to the shop?')) return;
    setStaffError(null);
    const res = await adminFetch(`/admin/shops/${shop.id}/staff/${userId}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setStaffError(data?.message || 'Could not remove this staff member');
      return;
    }
    await load();
  }

  async function onSaveBilling(e: React.FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setBillingBusy(true);
    setBillingSaved(false);
    setError(null);
    try {
      const res = await adminFetch(`/admin/shops/${shop.id}/billing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingPlan: billingForm.billingPlan,
          trialEndsAt: billingForm.trialEndsAt ? billingForm.trialEndsAt : null,
          billingNotes: billingForm.billingNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Could not update billing');
      await load();
      setBillingSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBillingBusy(false);
    }
  }

  async function onExport() {
    if (!shop) return;
    setExportBusy(true);
    setError(null);
    try {
      await downloadExport(shop.id, shop.slug);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExportBusy(false);
    }
  }

  if (notFound) return <div className="admin-empty">Shop not found.</div>;
  if (!shop) return <p>Loading...</p>;

  const ownerCount = shop.staff.filter((s) => s.role === 'OWNER').length;

  return (
    <div>
      <p style={{ marginBottom: 16 }}><Link href="/admin/shops">&larr; All shops</Link></p>

      <div className="admin-detail-head">
        <div>
          <span className={`admin-badge ${BADGE_CLASS[shop.status]}`} style={{ marginBottom: 8, display: 'inline-block' }}>{shop.status}</span>
          <h3>{shop.name}</h3>
          <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>
            {shop.slug} &middot; {shop.customDomain ?? `${shop.slug}.dukamall.app`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn-outline admin-btn" onClick={onExport} disabled={exportBusy}>
            {exportBusy ? 'Exporting...' : 'Export data'}
          </button>
          <button className="admin-btn" onClick={onImpersonate} disabled={impersonating}>
            {impersonating ? 'Opening...' : 'View as shop'}
          </button>
        </div>
      </div>

      {error ? <div className="admin-alert is-error">{error}</div> : null}

      <div className="admin-stat-row">
        <Stat label="Orders" value={shop.orderSummary.orderCount} />
        <Stat label="Paid orders" value={shop.orderSummary.paidOrderCount} />
        <Stat label="Revenue" value={`KES ${shop.orderSummary.totalRevenueKes.toLocaleString()}`} />
      </div>

      <div className="admin-card" style={{ marginBottom: 12 }}>
        <h4>Shop info</h4>
        <table className="admin-table">
          <tbody>
            <tr><td style={{ fontWeight: 600, width: 160 }}>WhatsApp number</td><td>{shop.whatsappNumber ?? <span style={{ color: 'var(--a-muted)' }}>Not set</span>}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Currency</td><td>{shop.currency}</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Created</td><td>{new Date(shop.createdAt).toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="admin-card" style={{ marginBottom: 12 }}>
        <h4>Domain</h4>
        {shop.customDomain ? (
          <>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              Verified &mdash; <strong>{shop.customDomain}</strong>
              {shop.domainVerifiedAt ? <span style={{ color: 'var(--a-muted)' }}> since {new Date(shop.domainVerifiedAt).toLocaleDateString()}</span> : null}
            </p>
            <button className="admin-btn-outline admin-btn admin-btn-sm" onClick={onDisconnectDomain} disabled={domainBusy}>
              Disconnect
            </button>
          </>
        ) : shop.pendingDomain ? (
          <>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              Pending verification &mdash; <strong>{shop.pendingDomain}</strong>. The merchant needs to add a DNS TXT
              record; if they've confirmed ownership another way (e.g. a support call) you can skip that check.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="admin-btn admin-btn-sm" onClick={onForceVerify} disabled={domainBusy}>
                Force verify
              </button>
              <button className="admin-btn-outline admin-btn admin-btn-sm" onClick={onDisconnectDomain} disabled={domainBusy}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--a-muted)' }}>Using platform subdomain only -- no custom domain requested.</p>
        )}
      </div>

      <div className="admin-card" style={{ marginBottom: 12 }}>
        <h4>Payments</h4>
        <span className={`admin-badge ${shop.paymentReady ? 'is-active' : 'is-trial'}`}>
          {shop.paymentReady ? 'Paystack configured' : 'Not configured'}
        </span>
        <p style={{ fontSize: 13, color: 'var(--a-muted)', marginTop: 8 }}>
          {shop.paymentReady
            ? 'This shop can take online card payments. Keys are set but never shown here.'
            : 'This shop has no Paystack keys set -- online checkout will fall back to "pay via WhatsApp" only.'}
        </p>
      </div>

      <div className="admin-card" style={{ marginBottom: 12 }}>
        <h4>Billing</h4>
        {shop.trialExpiringSoon ? (
          <div className="admin-alert is-warning" style={{ marginBottom: 12 }}>
            Trial ends soon -- {shop.trialEndsAt ? new Date(shop.trialEndsAt).toLocaleDateString() : ''}
          </div>
        ) : null}
        {billingSaved ? <div className="admin-alert is-success" style={{ marginBottom: 12 }}>Billing details saved.</div> : null}
        <form onSubmit={onSaveBilling} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="admin-field" style={{ marginBottom: 0, flex: '0 1 140px' }}>
            <label>Plan</label>
            <select
              value={billingForm.billingPlan}
              onChange={(e) => { setBillingForm((f) => ({ ...f, billingPlan: e.target.value as BillingPlan })); setBillingSaved(false); }}
            >
              <option value="TRIAL">Trial</option>
              <option value="BASIC">Basic</option>
              <option value="PRO">Pro</option>
            </select>
          </div>
          <div className="admin-field" style={{ marginBottom: 0, flex: '0 1 180px' }}>
            <label>Trial ends</label>
            <input
              type="date"
              value={billingForm.trialEndsAt}
              onChange={(e) => { setBillingForm((f) => ({ ...f, trialEndsAt: e.target.value })); setBillingSaved(false); }}
            />
          </div>
          <div className="admin-field" style={{ marginBottom: 0, flex: '1 1 260px' }}>
            <label>Notes</label>
            <textarea
              rows={2}
              placeholder="e.g. Paid via M-Pesa, ref ABC123, covers to Dec 2026"
              value={billingForm.billingNotes}
              onChange={(e) => { setBillingForm((f) => ({ ...f, billingNotes: e.target.value })); setBillingSaved(false); }}
            />
          </div>
          <button type="submit" className="admin-btn" disabled={billingBusy}>{billingBusy ? 'Saving...' : 'Save billing'}</button>
        </form>
      </div>

      {shop.theme ? (
        <div className="admin-card" style={{ marginBottom: 12 }}>
          <h4>Theme</h4>
          <div className="admin-theme-swatches">
            <div>
              <div className="admin-swatch" style={{ background: shop.theme.primaryColor }} title={shop.theme.primaryColor} />
              <p style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 4 }}>Primary</p>
            </div>
            <div>
              <div className="admin-swatch" style={{ background: shop.theme.accentColor }} title={shop.theme.accentColor} />
              <p style={{ fontSize: 11, color: 'var(--a-muted)', marginTop: 4 }}>Accent</p>
            </div>
            {shop.theme.logoUrl ? <img src={shop.theme.logoUrl} alt="Logo" className="admin-thumb" /> : null}
            {shop.theme.heroImageUrl ? <img src={shop.theme.heroImageUrl} alt="Hero" className="admin-thumb" /> : null}
            <p style={{ fontSize: 13, color: 'var(--a-muted)', marginLeft: 8 }}>
              {shop.theme.fontPairing} &middot; {shop.theme.layoutPreset} layout
            </p>
          </div>
        </div>
      ) : null}

      <div className="admin-card" style={{ marginBottom: 12 }}>
        <h4>Staff</h4>
        {shop.staff.length === 0 ? (
          <p style={{ color: 'var(--a-muted)', fontSize: 13, marginBottom: 16 }}>No staff on this shop.</p>
        ) : (
          <table className="admin-table" style={{ marginBottom: 16 }}>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {shop.staff.map((s) => (
                <tr key={s.userId}>
                  <td>{s.user.firstName} {s.user.lastName}</td>
                  <td>{s.user.email}</td>
                  <td>{s.role}</td>
                  <td>
                    {s.role === 'OWNER' && ownerCount <= 1 ? (
                      <span style={{ fontSize: 12, color: 'var(--a-muted)' }}>Only owner</span>
                    ) : (
                      <button className="admin-btn-ghost" onClick={() => onRemoveStaff(s.userId)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {invitedCredentials ? (
          <div className="admin-alert is-success">
            Added {invitedCredentials.email} with a temporary password: <strong>{invitedCredentials.temporaryPassword}</strong>
            <br />Share this with them now -- it won&apos;t be shown again. They should change it after logging in.
          </div>
        ) : null}
        {staffError ? <div className="admin-alert is-error">{staffError}</div> : null}

        <form onSubmit={onInviteStaff} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="admin-field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
            <label>Email</label>
            <input type="email" value={staffForm.email} onChange={(e) => setStaffForm((f) => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="admin-field" style={{ marginBottom: 0, flex: '1 1 140px' }}>
            <label>First name</label>
            <input value={staffForm.firstName} onChange={(e) => setStaffForm((f) => ({ ...f, firstName: e.target.value }))} required />
          </div>
          <div className="admin-field" style={{ marginBottom: 0, flex: '1 1 140px' }}>
            <label>Last name</label>
            <input value={staffForm.lastName} onChange={(e) => setStaffForm((f) => ({ ...f, lastName: e.target.value }))} required />
          </div>
          <div className="admin-field" style={{ marginBottom: 0, flex: '0 1 120px' }}>
            <label>Role</label>
            <select value={staffForm.role} onChange={(e) => setStaffForm((f) => ({ ...f, role: e.target.value as 'OWNER' | 'STAFF' }))}>
              <option value="STAFF">Staff</option>
              <option value="OWNER">Owner</option>
            </select>
          </div>
          <button type="submit" className="admin-btn" disabled={staffBusy}>{staffBusy ? 'Adding...' : 'Add staff'}</button>
        </form>
      </div>

      <div className="admin-card">
        <h4>Recent admin activity</h4>
        {shop.auditLog.length === 0 ? (
          <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>No admin actions recorded for this shop yet.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>When</th><th>Action</th><th>By</th><th>Reason</th></tr></thead>
            <tbody>
              {shop.auditLog.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(entry.createdAt).toLocaleString()}</td>
                  <td>
                    {ACTION_LABEL[entry.action] ?? entry.action}
                    {entry.metadata && typeof entry.metadata === 'object' && 'from' in entry.metadata ? (
                      <span style={{ color: 'var(--a-muted)' }}> ({String((entry.metadata as any).from)} &rarr; {String((entry.metadata as any).to)})</span>
                    ) : null}
                    {entry.metadata && typeof entry.metadata === 'object' && 'domain' in entry.metadata ? (
                      <span style={{ color: 'var(--a-muted)' }}> ({String((entry.metadata as any).domain)})</span>
                    ) : null}
                  </td>
                  <td>{entry.admin.email}</td>
                  <td>{entry.reason ?? <span style={{ color: 'var(--a-muted)' }}>&mdash;</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
