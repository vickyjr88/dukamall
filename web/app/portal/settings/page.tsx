"use client";

import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3211';

function authHeaders(): Record<string, string> {
  const token = window.localStorage.getItem('shops_platform_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function SettingsPage() {
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/portal/settings`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setWhatsappNumber(d.whatsappNumber ?? ''));
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    await fetch(`${API_BASE}/portal/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ whatsappNumber }),
    });
    setSaved(true);
  }

  return (
    <form onSubmit={onSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ margin: 0 }}>Shop settings</h3>
      <label>
        WhatsApp number (with country code, e.g. 254712345678)
        <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="254712345678" />
      </label>
      <p style={{ fontSize: 13, color: '#666' }}>
        Shown as the &quot;Buy via WhatsApp&quot; button on your storefront&apos;s cart page.
        Card payment (Paystack) setup isn&apos;t wired up in this admin yet -- contact platform support to connect it.
      </p>
      <button type="submit">Save</button>
      {saved ? <p style={{ color: 'green' }}>Saved.</p> : null}
    </form>
  );
}
