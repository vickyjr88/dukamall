"use client";

import { useEffect, useState } from 'react';
import { adminFetch } from './admin-api';

type TrendPoint = { date: string; revenueKes: number; orderCount: number };

/**
 * Paid revenue across every shop, bucketed by day -- plain divs sized by
 * relative revenue rather than a charting library, since this is one
 * sparkline-sized chart, not a reporting suite.
 */
export function DashboardTrend() {
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);

  useEffect(() => {
    adminFetch('/admin/stats/trend?days=30').then((r) => r.json()).then(setTrend).catch(() => setTrend([]));
  }, []);

  if (!trend) return null;
  if (trend.length === 0) {
    return (
      <div className="admin-card" style={{ marginBottom: 20 }}>
        <h4>Revenue, last 30 days</h4>
        <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>No paid orders in this window yet.</p>
      </div>
    );
  }

  const max = Math.max(...trend.map((p) => p.revenueKes), 1);

  return (
    <div className="admin-card" style={{ marginBottom: 20 }}>
      <h4>Revenue, last 30 days</h4>
      <div className="admin-trend">
        {trend.map((point) => (
          <div
            key={point.date}
            className="admin-trend-bar"
            data-empty={point.revenueKes === 0}
            style={{ height: `${Math.max(4, (point.revenueKes / max) * 100)}%` }}
            title={`${point.date}: KES ${point.revenueKes.toLocaleString()} (${point.orderCount} order${point.orderCount === 1 ? '' : 's'})`}
          />
        ))}
      </div>
    </div>
  );
}
