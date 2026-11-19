/**
 * The pure rules behind the Analytics overview and the Dashboard, kept free of the database so they can be tested:
 * the window before this one (to compare against), how much a number moved, the bucket size for a range, and a
 * trend with no gaps in it.
 *
 * Every day is a Nairobi day: an order at 23:30 on Tuesday is Tuesday's, whatever time the server's clock is on.
 */

export const SHOP_TZ = 'Africa/Nairobi';
const DAY = 24 * 60 * 60 * 1000;
/** Nairobi is UTC+3 all year (no daylight saving), so a local day is a fixed offset from UTC. */
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;

export type Bucket = 'day' | 'week' | 'month';

/** The window of the same length that ends just before `from`: what this period is compared with. */
export function previousWindow(from: Date, to: Date): { from: Date; to: Date } {
  const length = Math.max(1, to.getTime() - from.getTime() + 1);
  const prevTo = new Date(from.getTime() - 1);
  return { from: new Date(prevTo.getTime() - length + 1), to: prevTo };
}

/**
 * How much a number moved, as a fraction (0.25 is up 25%). Null when there is nothing to compare with: a rise from
 * zero is not "infinity percent", it is new, and the screen says so instead of showing a meaningless figure.
 */
export function change(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** A bucket that keeps a chart readable: days up to about a month, weeks up to about four months, then months. */
export function pickBucket(from: Date, to: Date): Bucket {
  const days = Math.ceil((to.getTime() - from.getTime() + 1) / DAY);
  if (days <= 35) return 'day';
  if (days <= 130) return 'week';
  return 'month';
}

/** The Nairobi calendar date (YYYY-MM-DD) an instant falls on. */
export function nairobiDay(instant: Date): string {
  return new Date(instant.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** The first day of the bucket a Nairobi date is in: itself, the Monday of its week, or the 1st of its month. */
export function bucketStart(day: string, bucket: Bucket): string {
  if (bucket === 'day') return day;
  const d = new Date(`${day}T00:00:00Z`);
  if (bucket === 'month') return `${day.slice(0, 7)}-01`;
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * DAY).toISOString().slice(0, 10);
}

function nextBucket(day: string, bucket: Bucket): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (bucket === 'day') return new Date(d.getTime() + DAY).toISOString().slice(0, 10);
  if (bucket === 'week') return new Date(d.getTime() + 7 * DAY).toISOString().slice(0, 10);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/**
 * A series with an entry for every bucket from `from` to `to`, zeros where nothing happened. A chart that only has
 * the days with sales joins two sales three weeks apart with a straight line and says nothing about the quiet
 * between them.
 */
export function zeroFill<T extends Record<string, number>>(rows: Array<{ date: string } & T>, from: Date, to: Date, bucket: Bucket, empty: T): Array<{ date: string } & T> {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: Array<{ date: string } & T> = [];
  const last = bucketStart(nairobiDay(to), bucket);
  let cursor = bucketStart(nairobiDay(from), bucket);
  // A hard stop: a bad range can never make this loop run for ever.
  for (let i = 0; i < 1000 && cursor <= last; i++) {
    out.push(byDate.get(cursor) ?? { date: cursor, ...empty });
    cursor = nextBucket(cursor, bucket);
  }
  return out;
}

/** Fills the seven weekdays (Monday first) and 24 hours so the "when do people buy" charts always have every bar. */
export function fillWeekdays(rows: Array<{ dow: number; orders: number; soldKes: number }>) {
  const by = new Map(rows.map((r) => [r.dow, r]));
  // Postgres counts Sunday as 0; shops think of the week as starting on Monday.
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow], orders: by.get(dow)?.orders ?? 0, soldKes: by.get(dow)?.soldKes ?? 0 }));
}
export function fillHours(rows: Array<{ hour: number; orders: number }>) {
  const by = new Map(rows.map((r) => [r.hour, r.orders]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, orders: by.get(hour) ?? 0 }));
}

/**
 * The window a date picker means: a "from" date is the start of that Nairobi day and a "to" date is the end of it. Without
 * dates it is the last 30 days to now. (A bare date read as UTC would end the last day at 03:00 the next morning in Nairobi,
 * and start the first at 03:00, so the first and last days would each be wrong by three hours.)
 */
export function nairobiWindow(from?: string, to?: string, now: Date = new Date()): { start: Date; end: Date } {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const end = to && dateOnly.test(to) ? new Date(`${to}T23:59:59.999+03:00`) : to ? new Date(to) : now;
  const fallback = new Date(end.getTime() - 30 * DAY);
  const start = from && dateOnly.test(from) ? new Date(`${from}T00:00:00+03:00`) : from ? new Date(from) : fallback;
  return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end ? { start: fallback, end: now } : { start, end };
}
