"use client";

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { portalFetch } from '../portal-api';
import { FollowUp, FollowUpButton, FollowUpPreview } from '../follow-up';
import { Chips, Pager, SearchField, SortSelect, useListState } from '../list-kit';

type LeadLine = { id: string; variantId: string | null; name: string; size: string; quantity: number; priceKes: string; isCustomSize: boolean };
type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST';
type CartLead = {
  id: string; source: 'WHATSAPP_ORDER' | 'ABANDONED_CART'; status: LeadStatus; convertedOrderId: string | null;
  customerName: string | null; customerPhone: string | null; customerEmail: string | null;
  shippingAddress: string | null; message: string | null; createdAt: string; lines: LeadLine[];
  followUp: FollowUp | null;
};

const SOURCE_LABEL: Record<CartLead['source'], string> = { WHATSAPP_ORDER: 'WhatsApp order', ABANDONED_CART: 'Abandoned cart' };
const STATUS_LABEL: Record<LeadStatus, string> = { NEW: 'New', CONTACTED: 'Contacted', CONVERTED: 'Order created', LOST: 'Lost' };
const STATUS_CLASS: Record<LeadStatus, string> = { NEW: 'is-pending', CONTACTED: 'is-info', CONVERTED: 'is-paid', LOST: 'is-muted' };
type Counts = { all: number; NEW: number; CONTACTED: number; CONVERTED: number; LOST: number };
const SORTS = [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'name', label: 'Name A to Z' }];

// People who started a WhatsApp order or left items in their cart. This is the
// follow-up list: contact them, mark where it stands, and turn a real enquiry
// into an order (which also counts it toward stock, revenue and conversion).
export default function LeadsPage() {
  const { state, set, reset, ready, dirty } = useListState({ status: '', source: '' }, { sort: 'newest' });
  const [leads, setLeads] = useState<CartLead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = state.status as '' | LeadStatus;

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(state.page), pageSize: String(state.size), sort: state.sort });
    if (state.status) query.set('status', state.status);
    if (state.source) query.set('source', state.source);
    if (state.q) query.set('search', state.q);
    const res = await portalFetch(`/portal/cart-leads?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setCounts(data.counts);
    }
  }, [state.page, state.size, state.sort, state.status, state.source, state.q]);
  useEffect(() => { if (ready) void load(); }, [ready, load]);

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

  return (
    <div>
      <div className="portal-page-head">
        <h3>Leads</h3>
        <p style={{ fontSize: 13, color: 'var(--p-muted)' }}>People who started a WhatsApp order or left items in their cart. Contact them, then mark where it stands.</p>
      </div>

      <div className="portal-card" style={{ marginBottom: 14 }}>
        <div className="lk-toolbar">
          <SearchField value={state.q} onChange={(q) => set({ q })} placeholder="Name, phone, email or product" label="Search leads" />
          <label className="lk-field">
            Where from
            <select value={state.source} onChange={(e) => set({ source: e.target.value })}>
              <option value="">Any</option><option value="WHATSAPP_ORDER">WhatsApp order</option><option value="ABANDONED_CART">Abandoned cart</option>
            </select>
          </label>
          <SortSelect value={state.sort} onChange={(sort) => set({ sort })} options={SORTS} />
        </div>
        <Chips
          value={state.status}
          onChange={(v) => set({ status: v })}
          chips={[
            { value: '', label: 'All', count: counts?.all },
            { value: 'NEW', label: 'New', count: counts?.NEW, tone: 'warn' },
            { value: 'CONTACTED', label: 'Contacted', count: counts?.CONTACTED },
            { value: 'CONVERTED', label: 'Order created', count: counts?.CONVERTED },
            { value: 'LOST', label: 'Lost', count: counts?.LOST },
          ]}
        />
        {dirty ? <div style={{ marginTop: 10 }}><button type="button" className="portal-btn-ghost" onClick={reset}>Clear search and filters</button></div> : null}
      </div>
      {error ? <div className="portal-alert is-error">{error}</div> : null}

      {!leads ? <p>Loading...</p> : leads.length === 0 ? (
        <div className="portal-empty">{dirty ? 'No leads match that.' : 'No leads yet. These show up when a shopper orders via WhatsApp or leaves items in their cart.'}</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="portal-table">
            <thead><tr><th>When</th><th>Source</th><th>Customer</th><th>Items</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {leads.map((lead) => {
                const converted = lead.status === 'CONVERTED';
                return (
                  <Fragment key={lead.id}>
                    <tr>
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
                        <FollowUpButton followUp={lead.followUp} onOpened={() => { if (lead.status === 'NEW') void setLeadStatus(lead.id, 'CONTACTED'); }}>Follow up</FollowUpButton>{' '}
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
                          {lead.followUp ? <FollowUpPreview followUp={lead.followUp} /> : !converted && lead.status !== 'LOST' ? (
                            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--p-muted)' }}>No WhatsApp follow-up: this lead has no phone number we can message.</p>
                          ) : null}
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={state.page} pageSize={state.size} total={total} totalPages={totalPages} onPage={(page) => set({ page })} onSize={(size) => set({ size })} />
    </div>
  );
}
