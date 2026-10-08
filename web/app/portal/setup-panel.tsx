"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from './portal-api';

type ChecklistItem = { key: string; label: string; done: boolean; href: string; optional: boolean };
export type Overview = {
  shop: { name: string; status: string };
  plan: { plan: 'TRIAL' | 'BASIC' | 'PRO'; trialEndsAt: string | null; trialDaysLeft: number | null };
  urls: {
    storefront: string; productFeedXml: string; productFeedCsv: string; tiktokFeedXml: string; tiktokFeedCsv: string;
    sitemap: string; paystackWebhook: string | null;
  };
  checklist: ChecklistItem[];
};

const HIDE_KEY = 'shops_platform_hide_setup';

export function useOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    portalFetch('/portal/overview').then((r) => (r.ok ? r.json() : null)).then(setOverview).catch(() => {});
  }, []);
  return overview;
}

/** A line about the plan: only speaks up for a trial that is ending or over. */
export function PlanNotice({ plan }: { plan: Overview['plan'] }) {
  if (plan.plan !== 'TRIAL' || plan.trialDaysLeft === null) return null;
  const days = plan.trialDaysLeft;
  if (days > 7) return null;
  const expired = days < 0;
  return (
    <div className={`portal-alert ${expired ? 'is-error' : 'is-warn'}`} style={{ marginBottom: 20 }}>
      {expired
        ? `Your trial ended on ${new Date(plan.trialEndsAt!).toLocaleDateString()}. Contact the platform team to choose a plan and keep your shop running.`
        : days === 0
          ? 'Your trial ends today. Contact the platform team to choose a plan.'
          : `Your trial ends in ${days} day${days === 1 ? '' : 's'} (${new Date(plan.trialEndsAt!).toLocaleDateString()}). Contact the platform team to choose a plan.`}
    </div>
  );
}

/** "Get your shop ready": what is set up and what's next, hidden once it's all done (or when dismissed in this browser). */
export function SetupChecklist({ items }: { items: ChecklistItem[] }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try { setHidden(window.localStorage.getItem(HIDE_KEY) === '1'); } catch { /* storage can be blocked; show it */ }
  }, []);

  const done = items.filter((i) => i.done).length;
  if (done === items.length || hidden) return null;
  const percent = Math.round((done / items.length) * 100);

  return (
    <div className="portal-card" style={{ marginBottom: 20 }}>
      <h4 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Get your shop ready
        <button type="button" className="portal-btn-ghost" onClick={() => { try { window.localStorage.setItem(HIDE_KEY, '1'); } catch { /* ignore */ } setHidden(true); }}>Hide</button>
      </h4>
      <div style={{ fontSize: 13, color: 'var(--p-muted)', marginBottom: 8 }}>{done} of {items.length} done</div>
      <div className="po-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${percent}%` }} /></div>
      <ul className="po-checklist">
        {items.map((item) => (
          <li key={item.key} className={item.done ? 'is-done' : ''}>
            <span aria-hidden className="po-tick">{item.done ? '✓' : ''}</span>
            {item.done ? <span>{item.label}</span> : <Link href={item.href}>{item.label}</Link>}
            {!item.done && item.optional ? <span className="po-optional">optional</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
