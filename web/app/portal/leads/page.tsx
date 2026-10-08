"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';

type LeadLine = { id: string; variantId: string | null; name: string; size: string; quantity: number; priceKes: string; isCustomSize: boolean };
type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST';
type CartLead = {
  id: string; source: 'WHATSAPP_ORDER' | 'ABANDONED_CART'; status: LeadStatus; convertedOrderId: string | null;
  customerName: string | null; customerPhone: string | null; customerEmail: string | null;
  shippingAddress: string | null; message: string | null; createdAt: string; lines: LeadLine[];
};

const SOURCE_LABEL: Record<CartLead['source'], string> = { WHATSAPP_ORDER: 'WhatsApp order', ABANDONED_CART: 'Abandoned cart' };
const STATUS_LABEL: Record<LeadStatus, string> = { NEW: 'New', CONTACTED: 'Contacted', CONVERTED: 'Order created', LOST: 'Lost' };
const STATUS_CLASS: Record<LeadStatus, string> = { NEW: 'is-pending', CONTACTED: 'is-info', CONVERTED: 'is-paid', LOST: 'is-muted' };
const TABS: { value: '' | LeadStatus; label: string }[] = [
  { value: '', label: 'All' }, { value: 'NEW', label: 'New' }, { value: 'CONTACTED', label: 'Contacted' }, { value: 'CONVERTED', label: 'Order created' }, { value: 'LOST', label: 'Lost' },
];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// People who started a WhatsApp order or left items in their cart. This is the
// follow-up list: contact them, mark where it stands, and turn a real enquiry
// into an order (which also counts it toward stock, revenue and conversion).
export default function LeadsPage() {
  const [leads, setLeads] = useState<CartLead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<'' | LeadStatus>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) query.set('status', status);
    const res = await portalFetch(`/portal/cart-leads?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
  }
  useEffect(() => { load(); }, [page, pageSize, status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setLeadStatus(id: string, next: Exclude<LeadStatus, 'CONVERTED'>) {
    setError(null);
    const res = await portalFetch(`/portal/cart-leads/${id}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.message || 'Could not update this lead');
      return;
    }
    await load();
  }

  function contactHref(lead: CartLead): string | null {
    if (!lead.customerPhone) return null;
    const digits = lead.customerPhone.replace(/[^0-9]/g, '');
    const items = lead.lines.map((l) => `${l.quantity}x ${l.name} (${l.size})`).join(', ');
    const text = `Hi ${lead.customerName || 'there'}, following up on your order: ${items}`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div>
      <div className="portal-page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Leads</h3>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
          Per page
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ minWidth: 90 }}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="portal-tabs">
        {TABS.map((t) => (
          <button key={t.value} className={status === t.value ? 'is-active' : ''} onClick={() => { setStatus(t.value); setPage(1); }}>{t.label}</button>
        ))}
      </div>

      <p style={{ fontSize: 13, color: 'var(--p-muted)', margin: '12px 0 16px' }}>
        People who started a WhatsApp order or left items in their cart &mdash; {total} {status ? STATUS_LABEL[status].toLowerCase() : 'in total'}.
      </p>
      {error ? <div className="portal-alert is-error">{error}</div> : null}

      {!leads ? <p>Loading...</p> : leads.length === 0 ? (
        <div className="portal-empty">{status ? 'No leads with that status.' : 'No leads yet. These show up when a shopper orders via WhatsApp or leaves items in their cart.'}</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="portal-table">
            <thead><tr><th>When</th><th>Source</th><th>Customer</th><th>Items</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {leads.map((lead) => {
                const href = contactHref(lead);
                const converted = lead.status === 'CONVERTED';
                return (
                  <>
                    <tr key={lead.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(lead.createdAt).toLocaleString()}</td>
                      <td><span className={`portal-badge ${lead.source === 'WHATSAPP_ORDER' ? 'is-paid' : 'is-pending'}`}>{SOURCE_LABEL[lead.source]}</span></td>
                      <td>
                        {lead.customerName || <span style={{ color: 'var(--p-muted)' }}>Not given</span>}
                        {lead.customerPhone ? <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{lead.customerPhone}</div> : null}
                      </td>
                      <td>{lead.lines.length} item{lead.lines.length === 1 ? '' : 's'}</td>
                      <td><span className={`portal-badge ${STATUS_CLASS[lead.status]}`}>{STATUS_LABEL[lead.status]}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="portal-btn-ghost" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}>{expanded === lead.id ? 'Hide' : 'Details'}</button>
                        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => lead.status === 'NEW' && void setLeadStatus(lead.id, 'CONTACTED')}>WhatsApp</a> : null}{' '}
                        {converted && lead.convertedOrderId ? (
                          <Link href={`/portal/orders/${lead.convertedOrderId}`} className="portal-btn portal-btn-sm">View order</Link>
                        ) : (
                          <Link href={`/portal/orders/new?lead=${lead.id}`} className="portal-btn portal-btn-sm">Create order</Link>
                        )}
                      </td>
                    </tr>
                    {expanded === lead.id ? (
                      <tr key={`${lead.id}-detail`}>
                        <td colSpan={6} style={{ background: 'var(--p-paper)' }}>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {lead.lines.map((line) => (
                              <li key={line.id}>
                                {line.quantity} x {line.name} ({line.size}){line.isCustomSize ? ' -- size not in stock, customer typed their own' : ''} -- KES {Number(line.priceKes).toLocaleString()} each
                              </li>
                            ))}
                          </ul>
                          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {lead.customerEmail ? <p style={{ margin: 0 }}>Email: {lead.customerEmail}</p> : null}
                            {lead.shippingAddress ? <p style={{ margin: 0 }}>Shipping address: {lead.shippingAddress}</p> : null}
                            {lead.message ? <p style={{ margin: 0 }}>Message: {lead.message}</p> : null}
                          </div>
                          {!converted ? (
                            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                              {lead.status !== 'CONTACTED' ? <button className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => void setLeadStatus(lead.id, 'CONTACTED')}>Mark contacted</button> : null}
                              {lead.status !== 'LOST' ? <button className="portal-btn-outline portal-btn portal-btn-sm" onClick={() => void setLeadStatus(lead.id, 'LOST')}>Mark lost</button> : null}
                              {lead.status !== 'NEW' ? <button className="portal-btn-ghost" onClick={() => void setLeadStatus(lead.id, 'NEW')}>Reset to new</button> : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 20 }}>
          <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span style={{ fontSize: 13, color: 'var(--p-muted)' }}>Page {page} of {totalPages}</span>
          <button className="portal-btn-outline portal-btn portal-btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      ) : null}
    </div>
  );
}
