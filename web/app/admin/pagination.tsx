"use client";

/** Previous / 1 … 4 5 6 … 20 / Next, shared by the admin list screens. */
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const items: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) { if (p - prev > 1) items.push('ellipsis'); items.push(p); prev = p; }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
      <button className="admin-btn-outline admin-btn admin-btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      {items.map((item, i) =>
        item === 'ellipsis' ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--a-muted)' }}>&hellip;</span> : (
          <button key={item} className={item === page ? 'admin-btn admin-btn-sm' : 'admin-btn-outline admin-btn admin-btn-sm'} onClick={() => onChange(item)} aria-current={item === page ? 'page' : undefined}>{item}</button>
        ),
      )}
      <button className="admin-btn-outline admin-btn admin-btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}
