"use client";

/**
 * Number cards that say how they moved: the figure, "up 12% on the period before", and a small line of the trend.
 * Used by the Analytics overview and by the Dashboard, so the two never show the same number two different ways.
 */
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

export type Delta = number | null | undefined;

/** "Up 12%", "Down 4%", "No change", or "New" when there was nothing before (a rise from zero is not a percentage). */
export function DeltaChip({ change, current, previousLabel, goodWhen = 'up' }: { change: Delta; current: number; previousLabel: string; goodWhen?: 'up' | 'down' }) {
  if (change === null || change === undefined) {
    return <span className="kpi-delta is-flat">{current > 0 ? `New · none ${previousLabel}` : `No data ${previousLabel}`}</span>;
  }
  const pct = Math.round(Math.abs(change) * 100);
  if (pct === 0) return <span className="kpi-delta is-flat">No change {previousLabel}</span>;
  const up = change > 0;
  const good = goodWhen === 'up' ? up : !up;
  return <span className={`kpi-delta ${good ? 'is-good' : 'is-bad'}`}>{up ? '▲' : '▼'} {pct}% {previousLabel}</span>;
}

export function Spark({ data, dataKey, color }: { data: Array<Record<string, number | string>>; dataKey: string; color: string }) {
  if (data.length < 2) return null;
  return (
    <div className="kpi-spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height={36}>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.6} fill={color} fillOpacity={0.12} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Kpi({ label, value, hint, change, current, previousLabel, spark, sparkKey, color = '#2438a8', href }: {
  label: string; value: string; hint?: string; change?: Delta; current?: number; previousLabel?: string;
  spark?: Array<Record<string, number | string>>; sparkKey?: string; color?: string; href?: string;
}) {
  const body = (
    <>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {previousLabel !== undefined ? <DeltaChip change={change} current={current ?? 0} previousLabel={previousLabel} /> : null}
      {hint ? <div className="kpi-hint">{hint}</div> : null}
      {spark && sparkKey ? <Spark data={spark} dataKey={sparkKey} color={color} /> : null}
    </>
  );
  return href ? <a className="kpi is-link" href={href}>{body}</a> : <div className="kpi">{body}</div>;
}

/** What "previous" means in words: "vs previous 30 days", or "vs the day before" for one day. */
export function previousLabel(days: number): string {
  return days === 1 ? 'vs the day before' : `vs previous ${days} days`;
}
