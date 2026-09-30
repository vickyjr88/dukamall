"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type OrderLine = { id: string; quantity: number; priceKes: string; variant: { name: string; product: { name: string } } };
type Order = {
  id: string; orderNumber: string; status: 'PENDING' | 'PAID' | 'CANCELLED';
  firstName: string; lastName: string; email: string | null; phone: string | null; shippingAddress: string | null;
  totalKes: string; createdAt: string; lines: OrderLine[];
};

const STATUS_FILTERS = ['ALL', 'PENDING', 'PAID', 'CANCELLED'] as const;
const BADGE_CLASS: Record<Order['status'], string> = { PENDING: 'is-pending', PAID: 'is-paid', CANCELLED: 'is-cancelled' };
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [filter, setFilter] = useState<typeof STATUS_FILTERS[number]>('ALL');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const query = new URLSearchParams();
    if (filter !== 'ALL') query.set('status', filter);
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

  useEffect(() => { load(); }, [filter, search, from, to, page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateFilter(next: { search?: string; from?: string; to?: string }) {
    if (next.search !== undefined) setSearch(next.search);
    if (next.from !== undefined) setFrom(next.from);
    if (next.to !== undefined) setTo(next.to);
    setPage(1);
  }

  const hasFilters = Boolean(search || from || to);

  async function onSetStatus(orderId: string, status: Order['status']) {
    await portalFetch(`/portal/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
  }

  // Manual send, not automatic -- see the batch's own scoping note: this
  // just opens wa.me with a prefilled message for the merchant to review
  // and send themselves, the same "open wa.me, don't auto-send" pattern
  // the storefront's own WhatsApp buttons already use. No message content
  // or send status is stored server-side.
  const STATUS_MESSAGE: Record<Order['status'], string> = {
    PENDING: 'we\'ve received your order and it\'s pending confirmation',
    PAID: 'your payment has been confirmed and your order is being prepared',
    CANCELLED: 'your order has been cancelled',
  };

  function notifyHref(order: Order): string | null {
    if (!order.phone) return null;
    const digits = order.phone.replace(/[^0-9]/g, '');
    const text = `Hi ${order.firstName}, update on order ${order.orderNumber}: ${STATUS_MESSAGE[order.status]}.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div>
      <div className="portal-page-head"><h3>Orders</h3></div>

      <div className="portal-tabs">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={filter === s ? 'is-active' : ''} onClick={() => { setFilter(s); setPage(1); }}>{s}</button>
        ))}
      </div>

      <div className="portal-card" style={{ marginBottom: 16, marginTop: 12 }}>
        <form
          style={{ display: 'flex', gap: 8, marginBottom: 14 }}
          onSubmit={(e) => { e.preventDefault(); updateFilter({ search: searchDraft.trim() }); }}
        >
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search by order #, name, phone or email..."
            aria-label="Search orders"
            style={{ flex: 1 }}
          />
          <button type="submit" className="portal-btn">Search</button>
        </form>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
            From
            <input type="date" value={from} onChange={(e) => updateFilter({ from: e.target.value })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
            To
            <input type="date" value={to} onChange={(e) => updateFilter({ to: e.target.value })} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
            Per page
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ minWidth: 90 }}>
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {hasFilters ? (
            <button
              type="button"
              className="portal-btn-ghost"
              onClick={() => { setSearchDraft(''); setSearch(''); setFrom(''); setTo(''); setPage(1); }}
            >
              Clear filters
            </button>
          ) : null}
          <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--p-muted)' }}>
            {loading ? 'Loading...' : `${total} order${total === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {!orders ? <p>Loading...</p> : orders.length === 0 ? (
        <div className="portal-empty">No orders{filter !== 'ALL' ? ` with status ${filter}` : ''}{hasFilters ? ' match those filters' : ''} yet.</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="portal-table">
            <thead>
              <tr>
                <th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <>
                  <tr key={order.id}>
                    <td>{order.orderNumber}</td>
                    <td>
                      {order.firstName} {order.lastName}
                      {order.phone ? <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{order.phone}</div> : null}
                    </td>
                    <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td>KES {Number(order.totalKes).toLocaleString()}</td>
                    <td>
                      <span className={`portal-badge ${BADGE_CLASS[order.status]}`} style={{ marginRight: 8 }}>{order.status}</span>
                      <select value={order.status} onChange={(e) => onSetStatus(order.id, e.target.value as Order['status'])}>
                        <option value="PENDING">PENDING</option>
                        <option value="PAID">PAID</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="portal-btn-ghost" onClick={() => setExpanded(expanded === order.id ? null : order.id)}>
                        {expanded === order.id ? 'Hide' : 'Details'}
                      </button>
                      {notifyHref(order) ? (
                        <a href={notifyHref(order)!} target="_blank" rel="noopener noreferrer" className="portal-btn portal-btn-sm">
                          Notify
                        </a>
                      ) : null}
                    </td>
                  </tr>
                  {expanded === order.id ? (
                    <tr key={`${order.id}-detail`}>
                      <td colSpan={6} style={{ background: 'var(--p-paper)' }}>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {order.lines.map((line) => (
                            <li key={line.id}>
                              {line.quantity} x {line.variant.product.name} ({line.variant.name}) -- KES {Number(line.priceKes).toLocaleString()} each
                            </li>
                          ))}
                        </ul>
                        <div style={{ marginTop: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {order.email ? <p style={{ margin: 0 }}>Email: {order.email}</p> : null}
                          {order.phone ? <p style={{ margin: 0 }}>Phone: {order.phone}</p> : null}
                          <p style={{ margin: 0 }}>
                            Shipping address: {order.shippingAddress ?? <span style={{ color: 'var(--p-muted)' }}>Not provided</span>}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
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
  for (const p of sorted) {
    if (p - prev > 1) items.push('ellipsis');
    items.push(p);
    prev = p;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 20 }}>
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </button>
      {items.map((item, i) =>
        item === 'ellipsis' ? (
          <span key={`e${i}`} style={{ padding: '0 4px', color: 'var(--p-muted)' }}>&hellip;</span>
        ) : (
          <button
            key={item}
            className={item === page ? 'portal-btn portal-btn-sm' : 'portal-btn-outline portal-btn portal-btn-sm'}
            onClick={() => onChange(item)}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}
      <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </div>
  );
}
