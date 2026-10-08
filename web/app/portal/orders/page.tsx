"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';
import { downloadFile, today } from '../download';
import { useSession } from '../portal-session';
import {
  FulfilmentBadge, FulfilmentStatus, OrderDetail, OrderSource, PaymentBadge, PaymentStatus, SOURCE_LABEL, money, whatsappLink,
} from '../order-ui';

type Order = Pick<OrderDetail, 'id' | 'orderNumber' | 'status' | 'fulfilmentStatus' | 'source' | 'firstName' | 'lastName' | 'phone' | 'totalKes' | 'createdAt'>;

const PAYMENT_TABS: { value: 'ALL' | PaymentStatus; label: string }[] = [
  { value: 'ALL', label: 'All' }, { value: 'PENDING', label: 'Unpaid' }, { value: 'PAID', label: 'Paid' }, { value: 'CANCELLED', label: 'Cancelled' },
];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const label = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' } as const;

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const { isOwner } = useSession();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [payment, setPayment] = useState<'ALL' | PaymentStatus>('ALL');
  const [fulfilment, setFulfilment] = useState<'' | FulfilmentStatus>('');
  const [source, setSource] = useState<'' | OrderSource>('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load() {
    setLoading(true);
    const query = new URLSearchParams();
    if (payment !== 'ALL') query.set('status', payment);
    if (fulfilment) query.set('fulfilment', fulfilment);
    if (source) query.set('source', source);
    if (search) query.set('search', search);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    query.set('page', String(page));
    query.set('pageSize', String(pageSize));
    const res = await portalFetch(`/portal/orders?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setOrders(data.orders);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [payment, fulfilment, source, search, from, to, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // The same filters as the list on screen, as a spreadsheet of every matching order (not just this page).
  async function onExport() {
    const query = new URLSearchParams();
    if (payment !== 'ALL') query.set('status', payment);
    if (fulfilment) query.set('fulfilment', fulfilment);
    if (source) query.set('source', source);
    if (search) query.set('search', search);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    setExporting(true);
    setExportError(await downloadFile(`/portal/orders/export-csv?${query.toString()}`, `orders-${today()}.csv`));
    setExporting(false);
  }

  // Any filter change goes back to page 1 -- staying on page 6 of a now-3-page result shows nothing.
  function filtered(change: () => void) { change(); setPage(1); }
  const hasFilters = Boolean(search || from || to || fulfilment || source);

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3>Orders</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {isOwner ? <button type="button" className="portal-btn-outline portal-btn" disabled={exporting || total === 0} onClick={onExport}>{exporting ? 'Preparing...' : 'Export CSV'}</button> : null}
          <Link href="/portal/orders/new" className="portal-btn">New order</Link>
        </div>
      </div>
      {exportError ? <div className="portal-alert is-error">{exportError}</div> : null}

      <div className="portal-tabs">
        {PAYMENT_TABS.map((t) => (
          <button key={t.value} className={payment === t.value ? 'is-active' : ''} onClick={() => filtered(() => setPayment(t.value))}>{t.label}</button>
        ))}
      </div>

      <div className="portal-card" style={{ marginBottom: 16, marginTop: 12 }}>
        <form style={{ display: 'flex', gap: 8, marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); filtered(() => setSearch(searchDraft.trim())); }}>
          <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Search by order #, name, phone or email..." aria-label="Search orders" style={{ flex: 1 }} />
          <button type="submit" className="portal-btn">Search</button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <label style={label}>
            Delivery
            <select value={fulfilment} onChange={(e) => filtered(() => setFulfilment(e.target.value as '' | FulfilmentStatus))} style={{ minWidth: 130 }}>
              <option value="">Any</option><option value="UNFULFILLED">To ship</option><option value="SHIPPED">Shipped</option><option value="DELIVERED">Delivered</option>
            </select>
          </label>
          <label style={label}>
            Source
            <select value={source} onChange={(e) => filtered(() => setSource(e.target.value as '' | OrderSource))} style={{ minWidth: 130 }}>
              <option value="">Any</option>
              {(Object.keys(SOURCE_LABEL) as OrderSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </select>
          </label>
          <label style={label}>From<input type="date" value={from} onChange={(e) => filtered(() => setFrom(e.target.value))} /></label>
          <label style={label}>To<input type="date" value={to} onChange={(e) => filtered(() => setTo(e.target.value))} /></label>
          <label style={label}>
            Per page
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ minWidth: 90 }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {hasFilters ? (
            <button type="button" className="portal-btn-ghost" onClick={() => { setSearchDraft(''); setSearch(''); setFrom(''); setTo(''); setFulfilment(''); setSource(''); setPage(1); }}>
              Clear filters
            </button>
          ) : null}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--p-muted)' }}>{loading ? 'Loading...' : `${total} order${total === 1 ? '' : 's'}`}</span>
        </div>
      </div>

      {!orders ? <p>Loading...</p> : orders.length === 0 ? (
        <div className="portal-empty">{hasFilters || payment !== 'ALL' ? 'No orders match those filters.' : <>No orders yet. <Link href="/portal/orders/new">Record one</Link> or wait for the first from your shop.</>}</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="portal-table">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Payment</th><th>Delivery</th><th>Source</th><th></th></tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const notify = whatsappLink(order.phone, `Hi ${order.firstName}, an update on order ${order.orderNumber}.`);
                return (
                  <tr key={order.id}>
                    <td><Link href={`/portal/orders/${order.id}`}><strong>{order.orderNumber}</strong></Link></td>
                    <td>
                      {order.firstName} {order.lastName}
                      {order.phone ? <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{order.phone}</div> : null}
                    </td>
                    <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td>{money(order.totalKes)}</td>
                    <td><PaymentBadge status={order.status} /></td>
                    <td><FulfilmentBadge status={order.fulfilmentStatus} cancelled={order.status === 'CANCELLED'} /></td>
                    <td style={{ fontSize: 13 }}>{SOURCE_LABEL[order.source]}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/portal/orders/${order.id}`} className="portal-btn-outline portal-btn portal-btn-sm">Open</Link>{' '}
                      {notify ? <a href={notify} target="_blank" rel="noopener noreferrer" className="portal-btn portal-btn-sm">Notify</a> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? <Pagination page={page} totalPages={totalPages} onChange={setPage} /> : null}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const items: (number | 'ellipsis')[] = [];
  let prev = 0;
  for (const p of sorted) { if (p - prev > 1) items.push('ellipsis'); items.push(p); prev = p; }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20 }}>
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
      {items.map((item, i) =>
        item === 'ellipsis' ? <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--p-muted)' }}>&hellip;</span> : (
          <button key={item} className={item === page ? 'portal-btn portal-btn-sm' : 'portal-btn-outline portal-btn portal-btn-sm'} onClick={() => onChange(item)} aria-current={item === page ? 'page' : undefined}>{item}</button>
        ),
      )}
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}
