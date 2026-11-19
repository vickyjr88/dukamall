"use client";

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';
import { downloadFile, today } from '../download';
import { useSession } from '../portal-session';
import {
  FulfilmentBadge, FulfilmentStatus, OrderDetail, OrderSource, PaymentBadge, PaymentStatus, SOURCE_LABEL, money,
} from '../order-ui';
import { FollowUpButton } from '../follow-up';
import { Chips, Pager, SearchField, SortHeader, SortSelect, useListState } from '../list-kit';

type Order = Pick<OrderDetail, 'id' | 'orderNumber' | 'status' | 'fulfilmentStatus' | 'source' | 'firstName' | 'lastName' | 'phone' | 'totalKes' | 'createdAt' | 'followUp'>;


type Counts = { all: number; PENDING: number; PAID: number; CANCELLED: number; toShip: number };
const SORTS = [
  { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' },
  { value: 'total_desc', label: 'Total: high to low' }, { value: 'total_asc', label: 'Total: low to high' },
  { value: 'customer', label: 'Customer A to Z' },
];

export default function OrdersPage() {
  const { isOwner } = useSession();
  const { state, set, reset, ready, dirty } = useListState({ payment: '', fulfilment: '', source: '', from: '', to: '' }, { sort: 'newest' });
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [shownTotal, setShownTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filterQuery = useCallback((): URLSearchParams => {
    const query = new URLSearchParams();
    if (state.payment) query.set('status', state.payment);
    if (state.fulfilment) query.set('fulfilment', state.fulfilment);
    if (state.source) query.set('source', state.source);
    if (state.q) query.set('search', state.q);
    if (state.from) query.set('from', state.from);
    if (state.to) query.set('to', state.to);
    return query;
  }, [state.payment, state.fulfilment, state.source, state.q, state.from, state.to]);

  const load = useCallback(async () => {
    setLoading(true);
    const query = filterQuery();
    query.set('sort', state.sort);
    query.set('page', String(state.page));
    query.set('pageSize', String(state.size));
    try {
      const res = await portalFetch(`/portal/orders?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setCounts(data.counts);
        setShownTotal(data.shownTotalKes);
      }
    } finally {
      setLoading(false);
    }
  }, [filterQuery, state.sort, state.page, state.size]);

  useEffect(() => { if (ready) void load(); }, [ready, load]);

  // The same filters as the list on screen, as a spreadsheet of every matching order (not just this page).
  async function onExport() {
    setExporting(true);
    setExportError(await downloadFile(`/portal/orders/export-csv?${filterQuery().toString()}`, `orders-${today()}.csv`));
    setExporting(false);
  }

  const tab = (value: string, label: string, count: number | undefined, tone?: 'warn' | 'danger') => ({ value, label, count, tone });

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3>Orders</h3>
          <p style={{ color: 'var(--p-muted)', fontSize: 13 }}>
            {loading && !orders ? 'Loading...' : `${total.toLocaleString()} order${total === 1 ? '' : 's'}${isOwner ? ` \u00b7 ${money(String(shownTotal))} (cancelled not counted)` : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isOwner ? <button type="button" className="portal-btn-outline portal-btn" disabled={exporting || total === 0} onClick={onExport}>{exporting ? 'Preparing...' : 'Export CSV'}</button> : null}
          <Link href="/portal/orders/new" className="portal-btn">New order</Link>
        </div>
      </div>
      {exportError ? <div className="portal-alert is-error">{exportError}</div> : null}

      <div className="portal-card" style={{ marginBottom: 14 }}>
        <div className="lk-toolbar">
          <SearchField value={state.q} onChange={(q) => set({ q })} placeholder="Order number, name, phone or email" label="Search orders" />
          <label className="lk-field">
            Delivery
            <select value={state.fulfilment} onChange={(e) => set({ fulfilment: e.target.value })}>
              <option value="">Any</option><option value="UNFULFILLED">To ship</option><option value="SHIPPED">Shipped</option><option value="DELIVERED">Delivered</option>
            </select>
          </label>
          <label className="lk-field">
            Source
            <select value={state.source} onChange={(e) => set({ source: e.target.value })}>
              <option value="">Any</option>
              {(Object.keys(SOURCE_LABEL) as OrderSource[]).map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="lk-field">From<input type="date" value={state.from} max={state.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="lk-field">To<input type="date" value={state.to} min={state.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label>
          <SortSelect value={state.sort} onChange={(sort) => set({ sort })} options={SORTS} />
        </div>
        <Chips
          value={state.payment}
          onChange={(payment) => set({ payment })}
          chips={[
            tab('', 'All', counts?.all),
            tab('PENDING', 'Unpaid', counts?.PENDING, 'warn'),
            tab('PAID', 'Paid', counts?.PAID),
            tab('CANCELLED', 'Cancelled', counts?.CANCELLED),
          ]}
        />
        <div style={{ marginTop: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {counts && counts.toShip > 0 ? (
            <button type="button" className="portal-btn-ghost" style={{ textDecoration: 'none', color: 'var(--p-warn)', fontWeight: 600 }} onClick={() => set({ fulfilment: 'UNFULFILLED' })}>
              {counts.toShip} still to ship &rarr;
            </button>
          ) : null}
          {dirty ? <button type="button" className="portal-btn-ghost" onClick={reset}>Clear search and filters</button> : null}
        </div>
      </div>

      {!orders ? <p>Loading...</p> : orders.length === 0 ? (
        <div className="portal-card portal-empty">{dirty ? 'No orders match those filters.' : <>No orders yet. <Link href="/portal/orders/new">Record one</Link> or wait for the first from your shop.</>}</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflowX: 'auto', opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
          <table className="portal-table">
            <thead>
              <tr>
                <SortHeader label="Order" asc="number" desc="number" sort={state.sort} onSort={(sort) => set({ sort })} />
                <SortHeader label="Customer" asc="customer" desc="customer" sort={state.sort} onSort={(sort) => set({ sort })} />
                <SortHeader label="Date" asc="oldest" desc="newest" sort={state.sort} onSort={(sort) => set({ sort })} />
                <SortHeader label="Total" asc="total_asc" desc="total_desc" sort={state.sort} onSort={(sort) => set({ sort })} />
                <th>Payment</th><th>Delivery</th><th>Source</th><th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td style={{ whiteSpace: 'nowrap' }}><Link href={`/portal/orders/${order.id}`}><strong>{order.orderNumber}</strong></Link></td>
                  <td>
                    {order.firstName} {order.lastName}
                    {order.phone ? <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{order.phone}</div> : null}
                  </td>
                  <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{money(order.totalKes)}</td>
                  <td><PaymentBadge status={order.status} /></td>
                  <td><FulfilmentBadge status={order.fulfilmentStatus} cancelled={order.status === 'CANCELLED'} /></td>
                  <td style={{ fontSize: 13 }}>{SOURCE_LABEL[order.source]}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Link href={`/portal/orders/${order.id}`} className="portal-btn-outline portal-btn portal-btn-sm">Open</Link>{' '}
                    <FollowUpButton followUp={order.followUp} solid>Follow up</FollowUpButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={state.page} pageSize={state.size} total={total} totalPages={totalPages} onPage={(page) => set({ page })} onSize={(size) => set({ size })} />
    </div>
  );
}
