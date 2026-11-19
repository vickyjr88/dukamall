"use client";

/**
 * One set of parts for every list in the portal: search, sort, filter chips, and a pager that says where you are.
 *
 * A list's state lives in the address bar (?q=&sort=&page=...), so a refresh, the back button, or a link sent to a
 * colleague lands on the same page of the same search -- the old lists forgot everything on a refresh. The page
 * waits for `ready` before its first load, so it never fetches once with defaults and again with the address's values.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const PAGE_SIZES = [10, 25, 50, 100];

type Base = { q: string; sort: string; page: number; size: number };
export type ListState<F extends Record<string, string>> = Base & F;

/** The pieces of a list's state that are not in `defaults` are dropped from the address, so a clean list has a clean URL. */
export function useListState<F extends Record<string, string>>(filterDefaults: F, defaults: { sort: string; size?: number }) {
  const baseDefaults = useMemo(() => ({ q: '', sort: defaults.sort, page: 1, size: defaults.size ?? 25, ...filterDefaults }), [defaults.sort, defaults.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<ListState<F>>(baseDefaults as ListState<F>);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next: Record<string, string | number> = { ...baseDefaults };
    for (const key of Object.keys(baseDefaults)) {
      const raw = params.get(key);
      if (raw === null) continue;
      if (key === 'page' || key === 'size') {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 1) next[key] = Math.floor(n);
      } else {
        next[key] = raw;
      }
    }
    setState(next as ListState<F>);
    setReady(true);
  }, [baseDefaults]);

  const write = useCallback((s: ListState<F>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(s)) {
      if (String(value) !== String((baseDefaults as Record<string, unknown>)[key])) params.set(key, String(value));
    }
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [baseDefaults]);

  /** Changing anything but the page goes back to page 1: staying on page 6 of a now three-page result shows nothing. */
  const set = useCallback((patch: Partial<ListState<F>>) => {
    setState((prev) => {
      const next = { ...prev, ...patch } as ListState<F>;
      if (!('page' in patch)) next.page = 1;
      write(next);
      return next;
    });
  }, [write]);

  const reset = useCallback(() => {
    setState(baseDefaults as ListState<F>);
    write(baseDefaults as ListState<F>);
  }, [baseDefaults, write]);

  const dirty = useMemo(
    () => Object.keys(filterDefaults).some((k) => state[k] !== filterDefaults[k]) || state.q !== '',
    [state, filterDefaults],
  );

  return { state, set, reset, ready, dirty };
}

/** Types into the box update the list after a short pause, not on every key. Enter searches at once; the cross clears. */
export function SearchField({ value, onChange, placeholder, label = 'Search' }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function push(v: string, delay: number) {
    setDraft(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (v.trim() !== value) onChange(v.trim()); }, delay);
  }

  return (
    <div className="lk-search">
      <input
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => push(e.target.value, 350)}
        onKeyDown={(e) => { if (e.key === 'Enter') push(draft, 0); }}
      />
      {draft ? <button type="button" aria-label="Clear search" className="lk-search-clear" onClick={() => push('', 0)}>&times;</button> : null}
    </div>
  );
}

export function SortSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="lk-field">
      Sort by
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** A column heading you can click to sort by; a second click reverses. `asc`/`desc` are the sort values this column maps to. */
export function SortHeader({ label, asc, desc, sort, onSort, align }: { label: string; asc: string; desc: string; sort: string; onSort: (v: string) => void; align?: 'right' }) {
  const on = sort === asc || sort === desc;
  const arrow = sort === asc ? '↑' : sort === desc ? '↓' : '';
  return (
    <th style={align ? { textAlign: align } : undefined} aria-sort={sort === asc ? 'ascending' : sort === desc ? 'descending' : 'none'}>
      <button type="button" className={`lk-sort${on ? ' is-on' : ''}`} onClick={() => onSort(sort === asc ? desc : asc)}>
        {label}<span aria-hidden="true">{arrow || '↕'}</span>
      </button>
    </th>
  );
}

/** Quick filters with how many each would show. A chip with a count of 0 stays visible but quiet, so the shape of the catalogue is readable. */
export function Chips<T extends string>({ value, onChange, chips }: { value: T; onChange: (v: T) => void; chips: { value: T; label: string; count?: number; tone?: 'warn' | 'danger' }[] }) {
  return (
    <div className="lk-chips" role="group">
      {chips.map((c) => (
        <button
          key={c.value || 'all'}
          type="button"
          aria-pressed={value === c.value}
          className={`lk-chip${value === c.value ? ' is-on' : ''}${c.count === 0 ? ' is-zero' : ''}${c.tone ? ` is-${c.tone}` : ''}`}
          onClick={() => onChange(c.value)}
        >
          {c.label}{c.count !== undefined ? <span className="lk-chip-n">{c.count.toLocaleString()}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pageSize, total, totalPages, onPage, onSize }: { page: number; pageSize: number; total: number; totalPages: number; onPage: (p: number) => void; onSize: (n: number) => void }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // Current page and two either side, with the first and last always there; a flat 1..N would be unreadable at 40 pages.
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const items: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of Array.from(pages).sort((a, b) => a - b)) {
    if (p - prev > 1) items.push('gap');
    items.push(p);
    prev = p;
  }

  return (
    <div className="lk-pager">
      <span className="lk-pager-count">Showing {from.toLocaleString()}&ndash;{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="lk-pager-pages">
        <button type="button" className="portal-btn portal-btn-outline portal-btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>&lsaquo; Prev</button>
        {items.map((it, i) => it === 'gap'
          ? <span key={`g${i}`} className="lk-pager-gap">&hellip;</span>
          : (
            <button key={it} type="button" className={`portal-btn portal-btn-sm${it === page ? '' : ' portal-btn-outline'}`} aria-current={it === page ? 'page' : undefined} onClick={() => onPage(it)}>{it}</button>
          ))}
        <button type="button" className="portal-btn portal-btn-outline portal-btn-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next &rsaquo;</button>
      </div>
      <label className="lk-pager-size">
        Rows
        <select value={pageSize} onChange={(e) => onSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Ticked rows by id, kept across pages of the same search and cleared by `clear`. */
export function useSelection() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => setIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const setMany = useCallback((list: string[], on: boolean) => setIds((prev) => { const n = new Set(prev); list.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; }), []);
  const clear = useCallback(() => setIds(new Set()), []);
  return { ids, toggle, setMany, clear };
}

/**
 * Search, sort and paging for a list the page already holds in full (discount codes, categories): the same controls and
 * the same state as the server-backed lists, without a round trip. Searching ignores case and matches every word.
 */
export function useLocalList<T>(items: T[] | null, opts: { text: (item: T) => string; sorts: Record<string, (a: T, b: T) => number>; sort: string; size?: number }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(opts.sort);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(opts.size ?? 25);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const kept = (items ?? []).filter((item) => { const t = opts.text(item).toLowerCase(); return words.every((w) => t.includes(w)); });
    const compare = opts.sorts[sort] ?? Object.values(opts.sorts)[0];
    return [...kept].sort(compare);
  }, [items, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * size, current * size);

  return {
    q, sort, page: current, size, rows, total: filtered.length, totalPages, all: items?.length ?? 0,
    setQ: (v: string) => { setQ(v); setPage(1); },
    setSort: (v: string) => { setSort(v); setPage(1); },
    setPage,
    setSize: (n: number) => { setSize(n); setPage(1); },
  };
}
