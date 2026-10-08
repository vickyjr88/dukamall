/** Plain-English names for the actions recorded in the admin audit log. */
export const ACTION_LABEL: Record<string, string> = {
  'shop.status_changed': 'Status changed',
  'shop.impersonated': 'Viewed as shop',
  'shop.exported': 'Data exported',
  'domain.force_verified': 'Domain force-verified',
  'domain.disconnected': 'Domain disconnected',
  'staff.invited': 'Staff invited',
  'staff.removed': 'Staff removed',
  'billing.updated': 'Billing updated',
  'admin.super_admin_changed': 'Admin access changed',
  'admin.login': 'Admin logged in',
  'admin.login_failed': 'Failed admin login',
  'platform.smtp_updated': 'Email settings changed',
  'platform.test_email': 'Test email sent',
};

/** A short detail string for an entry's metadata, where it has something worth showing. */
export function describeMetadata(action: string, metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (action === 'admin.super_admin_changed' && m.targetEmail) return `${String(m.targetEmail)}: ${m.to ? 'made admin' : 'removed'}`;
  if ('from' in m && 'to' in m) return `${String(m.from)} → ${String(m.to)}`;
  if (action === 'staff.invited' && m.email) return `${String(m.email)} as ${String(m.role).toLowerCase()}`;
  if ('domain' in m && m.domain) return String(m.domain);
  if (action === 'platform.smtp_updated' && Array.isArray(m.fields)) return (m.fields as string[]).join(', ');
  if (action === 'platform.test_email') return `${String(m.to)} (${String(m.status).toLowerCase()})`;
  if (action === 'billing.updated') {
    const parts = Object.keys(m);
    return parts.length ? `changed ${parts.join(', ')}` : null;
  }
  return null;
}
