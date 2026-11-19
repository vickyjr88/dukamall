import { bucketStart, change, fillHours, fillWeekdays, nairobiDay, nairobiWindow, pickBucket, previousWindow, zeroFill } from '../../src/portal-analytics/overview';

const d = (iso: string) => new Date(iso);

describe('previousWindow', () => {
  it('is the same length and ends just before the period starts', () => {
    const prev = previousWindow(d('2026-11-10T00:00:00Z'), d('2026-11-16T23:59:59.999Z'));
    expect(prev.to.toISOString()).toBe('2026-11-09T23:59:59.999Z');
    expect(prev.from.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });
});

describe('change', () => {
  it('is a fraction, up or down', () => {
    expect(change(150, 100)).toBeCloseTo(0.5);
    expect(change(50, 100)).toBeCloseTo(-0.5);
  });
  it('is null rather than infinite when there was nothing before', () => {
    expect(change(10, 0)).toBeNull();
    expect(change(0, 0)).toBeNull();
    expect(change(NaN, 5)).toBeNull();
  });
});

describe('pickBucket', () => {
  it('uses days for a month, weeks for a quarter, months beyond', () => {
    expect(pickBucket(d('2026-11-01T00:00:00Z'), d('2026-11-30T23:59:59Z'))).toBe('day');
    expect(pickBucket(d('2026-09-01T00:00:00Z'), d('2026-11-30T23:59:59Z'))).toBe('week');
    expect(pickBucket(d('2026-01-01T00:00:00Z'), d('2026-11-30T23:59:59Z'))).toBe('month');
  });
});

describe('Nairobi days', () => {
  it('puts 23:30 Nairobi time on that day, not the next UTC one', () => {
    // 20:30 UTC is 23:30 in Nairobi.
    expect(nairobiDay(d('2026-11-17T20:30:00Z'))).toBe('2026-11-17');
    // 21:30 UTC is 00:30 the next day in Nairobi.
    expect(nairobiDay(d('2026-11-17T21:30:00Z'))).toBe('2026-11-18');
  });
  it('starts a week on Monday and a month on the 1st', () => {
    expect(bucketStart('2026-11-19', 'week')).toBe('2026-11-16'); // a Thursday
    expect(bucketStart('2026-11-22', 'week')).toBe('2026-11-16'); // the Sunday still belongs to that week
    expect(bucketStart('2026-11-19', 'month')).toBe('2026-11-01');
  });
});

describe('zeroFill', () => {
  it('has an entry for every day, zeros where nothing happened', () => {
    const rows = [{ date: '2026-11-10', orders: 2 }, { date: '2026-11-13', orders: 1 }];
    const out = zeroFill(rows, d('2026-11-09T21:00:00Z'), d('2026-11-13T20:59:59Z'), 'day', { orders: 0 });
    expect(out.map((r) => r.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(out.map((r) => r.orders)).toEqual([2, 0, 0, 1]);
  });
  it('fills weeks and months', () => {
    const weeks = zeroFill([], d('2026-11-01T00:00:00Z'), d('2026-11-30T00:00:00Z'), 'week', { orders: 0 });
    expect(weeks.map((r) => r.date)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    const months = zeroFill([], d('2026-09-15T00:00:00Z'), d('2026-11-20T00:00:00Z'), 'month', { orders: 0 });
    expect(months.map((r) => r.date)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
  });
});

describe('weekday and hour fill', () => {
  it('lists Monday first and keeps empty days', () => {
    const out = fillWeekdays([{ dow: 0, orders: 3, soldKes: 900 }, { dow: 1, orders: 1, soldKes: 100 }]);
    expect(out.map((r) => r.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(out[0].orders).toBe(1);
    expect(out[6]).toMatchObject({ label: 'Sun', orders: 3, soldKes: 900 });
    expect(out[2].orders).toBe(0);
  });
  it('has all 24 hours', () => {
    const out = fillHours([{ hour: 14, orders: 4 }]);
    expect(out).toHaveLength(24);
    expect(out[14].orders).toBe(4);
    expect(out[3].orders).toBe(0);
  });
});

describe('nairobiWindow', () => {
  it('reads date-only inputs as whole Nairobi days', () => {
    const w = nairobiWindow('2026-11-10', '2026-11-16');
    expect(w.start.toISOString()).toBe('2026-11-09T21:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-11-16T20:59:59.999Z');
  });
  it('falls back to the last 30 days for nothing, or for a backwards range', () => {
    const now = d('2026-11-19T12:00:00Z');
    const none = nairobiWindow(undefined, undefined, now);
    expect(none.end).toEqual(now);
    expect(Math.round((now.getTime() - none.start.getTime()) / 86400000)).toBe(30);
    const back = nairobiWindow('2026-11-20', '2026-11-10', now);
    expect(back.end).toEqual(now);
  });
});
