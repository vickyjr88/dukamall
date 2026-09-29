"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '../../admin-api';

type Theme = {
  primaryColor: string; accentColor: string; logoUrl: string | null;
  heroImageUrl: string | null; fontPairing: string; layoutPreset: string;
};
type StaffRow = { userId: string; role: 'OWNER' | 'STAFF'; user: { email: string; firstName: string; lastName: string } };
type AuditEntry = { id: string; action: string; reason: string | null; metadata: Record<string, unknown> | null; createdAt: string; admin: { email: string } };
type ShopDetail = {
  id: string; slug: string; name: string; customDomain: string | null;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED'; currency: string; whatsappNumber: string | null;
  pendingDomain: string | null; domainVerifiedAt: string | null; createdAt: string;
  theme: Theme | null;
  staff: StaffRow[];
  orderSummary: { orderCount: number; paidOrderCount: number; totalRevenueKes: number };
  auditLog: AuditEntry[];
};

const BADGE_CLASS: Record<ShopDetail['status'], string> = { TRIAL: 'is-trial', ACTIVE: 'is-active', SUSPENDED: 'is-suspended' };

const ACTION_LABEL: Record<string, string> = {
  'shop.status_changed': 'Status changed',
  'shop.impersonated': 'Viewed as shop',
};

export default function ShopDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await adminFetch(`/admin/shops/${params.id}`);
    if (res.status === 401) { router.replace('/admin/login'); return; }
    if (res.status === 404) { setNotFound(true); return; }
    setShop(await res.json());
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
      // that origin. The token rides a one-time query param to a portal
      // page that stores it and redirects -- see portal/sso/page.tsx.
      // A verified custom domain is the host that's actually configured to
      // resolve to this shop; only fall back to the platform subdomain when
      // there is none.
      const host = shop.customDomain || `${data.shopSlug}.${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3203'}`;
      const portalBase = `${window.location.protocol}//${host}`;
      window.open(`${portalBase}/portal/sso?token=${encodeURIComponent(data.access_token)}`, '_blank', 'noopener');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImpersonating(false);
    }
  }

  if (notFound) return <div className="admin-empty">Shop not found.</div>;
  if (!shop) return <p>Loading...</p>;

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
        <button className="admin-btn" onClick={onImpersonate} disabled={impersonating}>
          {impersonating ? 'Opening...' : 'View as shop'}
        </button>
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
            <tr>
              <td style={{ fontWeight: 600 }}>Domain</td>
              <td>
                {shop.customDomain ? (
                  <>Verified &mdash; {shop.customDomain}</>
                ) : shop.pendingDomain ? (
                  <>Pending verification &mdash; {shop.pendingDomain}</>
                ) : (
                  <span style={{ color: 'var(--a-muted)' }}>Using platform subdomain only</span>
                )}
              </td>
            </tr>
            <tr><td style={{ fontWeight: 600 }}>Created</td><td>{new Date(shop.createdAt).toLocaleString()}</td></tr>
          </tbody>
        </table>
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
          <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>No staff on this shop.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {shop.staff.map((s) => (
                <tr key={s.userId}>
                  <td>{s.user.firstName} {s.user.lastName}</td>
                  <td>{s.user.email}</td>
                  <td>{s.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
