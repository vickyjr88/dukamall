import { lookup } from 'dns/promises';
import { isIP } from 'net';

const MAX_BYTES = 20_000_000;
const MAX_REDIRECTS = 3;

/**
 * Whether an address is one that only the server itself or its own network can reach (loopback, private, link-local, carrier-grade NAT, multicast, and
 * IPv4 inside IPv6). A shop owner chooses the product photo's address, so the server must not be made to fetch such a thing for them.
 */
export function isPrivateAddress(ip: string): boolean {
  const v6mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (v6mapped) return isPrivateAddress(v6mapped[1]);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff');
  }
  return true; // not an address at all: refuse
}

type Deps = { resolve?: (host: string) => Promise<string[]>; fetch?: typeof fetch };

const defaultResolve = async (host: string) => (await lookup(host, { all: true })).map((a) => a.address);

async function assertPublic(url: URL, resolve: NonNullable<Deps['resolve']>) {
  if (url.protocol !== 'https:') throw new Error('The product photo is not an https address');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (!addresses.length) throw new Error('The product photo address could not be found');
  if (addresses.some(isPrivateAddress)) throw new Error('The product photo is on a private address');
}

/**
 * Fetches a product photo. Bounded in time (20 s), size (20 MB) and redirects (3), https only, and never from a private or internal address: it is
 * a file some shop chose, fetched by address. Every redirect is checked the same way.
 */
export async function fetchPhoto(address: string, deps: Deps = {}): Promise<Buffer> {
  const resolve = deps.resolve ?? defaultResolve;
  const doFetch = deps.fetch ?? fetch;
  let url: URL;
  try { url = new URL(address); } catch { throw new Error('The product photo is not a web address'); }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublic(url, resolve);
    const response = await doFetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next) throw new Error('The product photo redirects nowhere');
      url = new URL(next, url);
      continue;
    }
    if (!response.ok) throw new Error(`The product photo could not be fetched (HTTP ${response.status})`);
    if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('The product photo is too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error('The product photo is too large');
    return buffer;
  }
  throw new Error('The product photo redirects too many times');
}
