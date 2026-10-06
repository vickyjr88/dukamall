import sharp from 'sharp';

/**
 * Link-preview images. WhatsApp and similar apps want a roughly 1.91:1 image
 * that is small -- WhatsApp commonly drops the thumbnail for anything over
 * ~300 KB -- but merchants upload whatever their camera produced (the msa
 * hero is a 2 MB PNG; product photos are portrait). Pointing og:image at the
 * raw upload therefore gave no preview or a badly cropped one. These routes
 * serve the same photo recomposed to 1200x630 as a small JPEG instead.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/**
 * Hosts this server will fetch an image from. The source URL is merchant
 * data (a product's imageUrls accepts any string), so fetching it blindly
 * would let a merchant make this server request arbitrary addresses --
 * internal ones included. Only the platform's own media host (the API
 * origin) plus anything listed in OG_IMAGE_EXTRA_HOSTS (comma-separated
 * hostnames, for media that lives on another host) is fetched.
 */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const value of [process.env.NEXT_PUBLIC_API_BASE_URL]) {
    try { if (value) hosts.add(new URL(value).hostname); } catch { /* ignore a malformed value */ }
  }
  for (const host of (process.env.OG_IMAGE_EXTRA_HOSTS || '').split(',')) {
    if (host.trim()) hosts.add(host.trim().toLowerCase());
  }
  return hosts;
}

/** Centres the photo on a blurred copy of itself, so portrait and square shots fill the card without being cropped. */
async function compose(source: Buffer): Promise<Buffer> {
  // Flattened onto white first: a transparent logo PNG would otherwise come
  // out black in a JPEG.
  const base = await sharp(source, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' }).toBuffer();
  const [background, foreground] = await Promise.all([
    sharp(base).resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover' }).blur(24).modulate({ brightness: 0.92 }).toBuffer(),
    sharp(base).resize(OG_WIDTH, OG_HEIGHT, { fit: 'inside' }).toBuffer(),
  ]);
  return sharp(background)
    .composite([{ input: foreground, gravity: 'centre' }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/**
 * Anything unexpected -- a host that isn't allowed, a slow or failing fetch,
 * a file that isn't an image -- redirects to the original image rather than
 * failing, so a preview is never worse than it was before this existed.
 */
export async function ogImageResponse(sourceUrl: string | null | undefined): Promise<Response> {
  if (!sourceUrl) return new Response('No image', { status: 404 });

  let url: URL;
  try { url = new URL(sourceUrl); } catch { return new Response('No image', { status: 404 }); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return new Response('No image', { status: 404 });

  if (!allowedHosts().has(url.hostname)) return Response.redirect(url.toString(), 302);

  try {
    // redirect: 'error' -- an allowed host must not be able to bounce this
    // fetch on to somewhere that isn't.
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) {
      return Response.redirect(url.toString(), 302);
    }
    if (Number(res.headers.get('content-length') || 0) > MAX_SOURCE_BYTES) return Response.redirect(url.toString(), 302);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_SOURCE_BYTES) return Response.redirect(url.toString(), 302);

    const jpeg = await compose(bytes);
    return new Response(new Uint8Array(jpeg), {
      headers: {
        'Content-Type': 'image/jpeg',
        // Cached a day at the edge: a changed photo shows up within a day,
        // and crawlers re-fetching the same preview don't re-render it.
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch {
    return Response.redirect(url.toString(), 302);
  }
}
