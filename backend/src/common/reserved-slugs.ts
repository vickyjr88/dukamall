/**
 * Subdomain names a merchant may not register. A shop lives at
 * <slug>.<platform domain>, so these would let a merchant sit on an address
 * that looks like the platform itself (support., login., billing.) or collide
 * with infrastructure (www., api., mail.).
 */
export const RESERVED_SLUGS = [
  'www', 'api', 'app', 'admin', 'administrator', 'portal', 'dashboard', 'console', 'root', 'system',
  'mail', 'email', 'smtp', 'imap', 'pop', 'webmail', 'mx', 'ns', 'ns1', 'ns2', 'dns', 'ftp', 'sftp', 'ssh', 'vpn',
  'support', 'help', 'helpdesk', 'billing', 'payments', 'pay', 'secure', 'security', 'account', 'accounts',
  'login', 'signin', 'signup', 'register', 'auth', 'sso', 'oauth', 'verify',
  'status', 'blog', 'docs', 'developer', 'developers', 'dev', 'staging', 'stage', 'test', 'demo', 'beta',
  'cdn', 'static', 'assets', 'media', 'files', 'images', 'img', 'upload', 'uploads',
  'shop', 'shops', 'store', 'stores', 'platform', 'official', 'dukamall', 'paystack', 'mpesa', 'safaricom',
] as const;

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug.toLowerCase());
}
