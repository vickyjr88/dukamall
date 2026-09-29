"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { adminFetch } from '../admin-api';

type Lead = {
  id: string;
  source: 'WHATSAPP_ORDER' | 'ABANDONED_CART';
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  message: string | null;
  createdAt: string;
  shop: { id: string; name: string; slug: string };
  lines: { name: string; size: string; quantity: number }[];
};

const SOURCE_LABEL: Record<Lead['source'], string> = {
  WHATSAPP_ORDER: 'WhatsApp order',
  ABANDONED_CART: 'Abandoned cart',
};

export default function AdminLeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    adminFetch('/admin/cart-leads?limit=50').then(async (res) => {
      if (res.status === 401) { setAuthFailed(true); return; }
      setLeads(await res.json());
    });
  }, []);

  useEffect(() => {
    if (authFailed) router.replace('/admin/login');
  }, [authFailed, router]);

  if (authFailed) return null;

  return (
    <div>
      <div className="admin-page-head">
        <h3>Leads</h3>
        <p style={{ color: 'var(--a-muted)', fontSize: 13 }}>
          Recent WhatsApp orders and abandoned carts across every shop -- which shops are getting inquiries, not just which have made a sale.
        </p>
      </div>

      {!leads ? <p>Loading...</p> : leads.length === 0 ? (
        <div className="admin-empty">No leads recorded yet.</div>
      ) : (
        <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Source</th>
                <th>Customer</th>
                <th>Items</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td><Link href={`/admin/shops/${lead.shop.id}`}>{lead.shop.name}</Link></td>
                  <td>{SOURCE_LABEL[lead.source]}</td>
                  <td>
                    {lead.customerName || lead.customerPhone || lead.customerEmail ? (
                      <>
                        {lead.customerName ?? <span style={{ color: 'var(--a-muted)' }}>No name</span>}
                        {lead.customerPhone ? <div style={{ fontSize: 12, color: 'var(--a-muted)' }}>{lead.customerPhone}</div> : null}
                      </>
                    ) : (
                      <span style={{ color: 'var(--a-muted)' }}>Not provided</span>
                    )}
                  </td>
                  <td>
                    {lead.lines.length > 0
                      ? lead.lines.map((l) => `${l.quantity}x ${l.name}${l.size ? ` (${l.size})` : ''}`).join(', ')
                      : <span style={{ color: 'var(--a-muted)' }}>&mdash;</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(lead.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
