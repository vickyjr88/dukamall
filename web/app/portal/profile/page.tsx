"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { portalFetch } from '../portal-api';
import { clearCachedRole, useSession } from '../portal-session';
import { ChangePasswordCard } from '../change-password-card';
import { Overview, useOverview } from '../setup-panel';

const PLAN_LABEL: Record<Overview['plan']['plan'], string> = { TRIAL: 'Free trial', BASIC: 'Basic', PRO: 'Pro' };

// The signed-in person's own page: their name, role, shop and plan, password,
// and signing out. (Shop-wide settings live under Settings.)
export default function ProfilePage() {
  const router = useRouter();
  const { me, ready, isOwner, refresh } = useSession();
  const overview = useOverview();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the form once the session arrives, but never overwrite what's being typed.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (me && !filled) { setFirstName(me.firstName); setLastName(me.lastName); setFilled(true); }
  }, [me, filled]);

  const dirty = Boolean(me) && (firstName.trim() !== me!.firstName || lastName.trim() !== me!.lastName);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await portalFetch('/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(Array.isArray(data?.message) ? data.message.join(', ') : data?.message || 'Could not save your details');
      return;
    }
    setSaved(true);
    refresh();
  }

  function onLogout() {
    window.localStorage.removeItem('shops_platform_token');
    clearCachedRole();
    router.push('/portal/login');
  }

  if (!ready || !me) return <p>Loading...</p>;

  return (
    <div>
      <div className="portal-page-head"><h3>My profile</h3></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
        <div className="portal-card">
          <h4>Your details</h4>
          <form onSubmit={onSave}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="portal-field" style={{ flex: 1 }}>
                <label htmlFor="pf-first">First name</label>
                <input id="pf-first" required maxLength={80} value={firstName} onChange={(e) => { setFirstName(e.target.value); setSaved(false); }} />
              </div>
              <div className="portal-field" style={{ flex: 1 }}>
                <label htmlFor="pf-last">Last name</label>
                <input id="pf-last" required maxLength={80} value={lastName} onChange={(e) => { setLastName(e.target.value); setSaved(false); }} />
              </div>
            </div>
            <div className="portal-field">
              <label htmlFor="pf-email">Email</label>
              <input id="pf-email" value={me.email} disabled />
              <span className="hint">This is how you log in, so it can&apos;t be changed here. Ask the platform team if you need it changed.</span>
            </div>
            <div className="portal-field">
              <label>Role in this shop</label>
              <div>
                <span className={`portal-badge ${isOwner ? 'is-paid' : 'is-info'}`}>{isOwner ? 'Owner' : 'Staff'}</span>
                <span className="hint" style={{ marginLeft: 8 }}>{isOwner ? 'You can change every setting and see all sales.' : 'You can record orders and manage stock. An owner manages settings and sales figures.'}</span>
              </div>
            </div>
            {saved ? <div className="portal-alert is-success">Saved.</div> : null}
            {error ? <div className="portal-alert is-error">{error}</div> : null}
            <button type="submit" className="portal-btn" disabled={saving || !dirty}>{saving ? 'Saving...' : 'Save'}</button>
          </form>
        </div>

        <div className="portal-card">
          <h4>Your shop</h4>
          <dl className="po-kv">
            <dt>Shop</dt><dd>{overview?.shop.name ?? '—'}</dd>
            {isOwner && overview ? (
              <>
                <dt>Plan</dt>
                <dd>
                  {PLAN_LABEL[overview.plan.plan]}
                  {overview.plan.plan === 'TRIAL' && overview.plan.trialEndsAt
                    ? ` — ${overview.plan.trialDaysLeft !== null && overview.plan.trialDaysLeft < 0 ? 'ended' : 'ends'} ${new Date(overview.plan.trialEndsAt).toLocaleDateString()}`
                    : ''}
                </dd>
              </>
            ) : null}
          </dl>
          {isOwner ? <p style={{ margin: '12px 0 0', fontSize: 13 }}><Link href="/portal/storefront">Edit shop name and details</Link></p> : null}
        </div>

        <ChangePasswordCard />

        <div className="portal-card">
          <h4>Session</h4>
          <button type="button" className="portal-btn-outline portal-btn" onClick={onLogout}>Log out</button>
        </div>
      </div>
    </div>
  );
}
