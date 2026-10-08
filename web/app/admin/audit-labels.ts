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
  'platform.trial_policy_updated': 'Trial policy changed',
  'admin.2fa_enabled': 'Two-factor sign-in turned on',
  'admin.2fa_disabled': 'Two-factor sign-in turned off',
  'user.reset_sent': 'Password reset sent',
  'staff.role_changed': 'Staff role changed',
  'shop.details_updated': 'Shop details edited',
};

/** A short detail string for an entry's metadata, where it has something worth showing. */
export function describeMetadata(action: string, metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  if (action === 'admin.super_admin_changed' && m.targetEmail) return `${String(m.targetEmail)}: ${m.to ? 'made admin' : 'removed'}`;
  if (action === 'user.reset_sent' && m.email) return String(m.email);
  if (action === 'staff.role_changed' && m.email) return `${String(m.email)}: ${String(m.from).toLowerCase()} → ${String(m.to).toLowerCase()}`;
  if (action === 'shop.details_updated' && Array.isArray(m.fields)) return `changed ${(m.fields as string[]).join(', ')}`;
  if (action === 'platform.trial_policy_updated') return `changed ${Object.keys(m).join(', ')}`;
  if ('from' in m && 'to' in m) return `${String(m.from)} → ${String(m.to)}${m.automatic ? ' (automatic)' : ''}`;
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
