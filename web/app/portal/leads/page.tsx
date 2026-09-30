"use client";

import { useEffect, useState } from 'react';
import { portalFetch } from '../portal-api';

type LeadLine = { id: string; name: string; size: string; quantity: number; priceKes: string; isCustomSize: boolean };
type CartLead = {
  id: string; source: 'WHATSAPP_ORDER' | 'ABANDONED_CART';
  customerName: string | null; customerPhone: string | null; customerEmail: string | null;
  shippingAddress: string | null; message: string | null; createdAt: string; lines: LeadLine[];
};

const SOURCE_LABEL: Record<CartLead['source'], string> = {
  WHATSAPP_ORDER: 'WhatsApp order',
  ABANDONED_CART: 'Abandoned cart',
};
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// The other half of the storefront's WhatsApp-order and abandoned-cart
// capture (CartLeadController.record) -- until this page existed, those
// rows were only visible cross-shop from the admin console, never to the
// merchant they actually belong to. This is the "who almost bought and
// didn't" follow-up list: enough contact info and cart contents to call or
// WhatsApp someone back, read-only (recording happens storefront-side).
export default function LeadsPage() {
  const [leads, setLeads] = useState<CartLead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    const res = await portalFetch(`/portal/cart-leads?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
  }

  useEffect(() => { load(); }, [page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <p style={{ fontSize: 13, color: 'var(--p-muted)', marginBottom: 16 }}>
        People who started a WhatsApp order or left items in their cart without checking out -- {total} total.
      </p>

      {!leads ? <p>Loading...</p> : leads.length === 0 ? (
        <div className="portal-empty">No leads yet. These show up when a shopper orders via WhatsApp or leaves items in their cart.</div>
      ) : (
        <div className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="portal-table">
            <thead>
              <tr><th>When</th><th>Source</th><th>Customer</th><th>Items</th><th></th></tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const href = contactHref(lead);
                return (
                  <>
                    <tr key={lead.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(lead.createdAt).toLocaleString()}</td>
                      <td>
                        <span className={`portal-badge ${lead.source === 'WHATSAPP_ORDER' ? 'is-paid' : 'is-pending'}`}>
                          {SOURCE_LABEL[lead.source]}
                        </span>
                      </td>
                      <td>
                        {lead.customerName || <span style={{ color: 'var(--p-muted)' }}>Not given</span>}
                        {lead.customerPhone ? <div style={{ fontSize: 12, color: 'var(--p-muted)' }}>{lead.customerPhone}</div> : null}
                      </td>
                      <td>{lead.lines.length} item{lead.lines.length === 1 ? '' : 's'}</td>
                      <td style={{ display: 'flex', gap: 8 }}>
                        <button className="portal-btn-ghost" onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}>
                          {expanded === lead.id ? 'Hide' : 'Details'}
                        </button>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="portal-btn portal-btn-sm">
                            WhatsApp
                          </a>
                        ) : null}
                      </td>
                    </tr>
                    {expanded === lead.id ? (
                      <tr key={`${lead.id}-detail`}>
                        <td colSpan={5} style={{ background: 'var(--p-paper)' }}>
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
