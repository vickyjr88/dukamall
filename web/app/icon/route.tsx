import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { getShopInfo, getTheme } from '@/app/lib/api';
import { fetchAllowedImageBytes } from '@/app/lib/og-image';

export const dynamic = 'force-dynamic';

const SIZE = 192; // a multiple of 48px, which is what Google asks of a site icon

const HEADERS = {
  // A changed logo shows up within a day. Vary: Host because the picture depends on which
  // shop's domain asked (see og-image.ts for the nginx cache-key story).
  'Cache-Control': 'public, max-age=3600, s-maxage=86400',
  'Vary': 'Host',
};

// The shop's favicon / home-screen icon: its logo squared up, else its first letter on its
// brand colour -- so a shop with no logo still has an icon instead of a 404 in the browser tab
// and a blank globe in Google's results.
export async function GET() {
  const [theme, shopInfo] = await Promise.all([getTheme(), getShopInfo()]);

  const logo = await fetchAllowedImageBytes(theme.logoUrl);
  if (logo) {
    try {
      // A wide banner uploaded as the "logo" is unreadable at icon size: use the letter tile instead.
      const { width = 0, height = 0 } = await sharp(logo, { failOn: 'none' }).metadata();
      const ratio = width && height ? width / height : 0;
      if (ratio < 0.67 || ratio > 1.5) throw new Error('not close enough to square');
      const png = await sharp(logo, { failOn: 'none' })
        .rotate()
        .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();
      return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', ...HEADERS } });
    } catch {
      // not a picture sharp can read, or not square enough: fall through to the letter tile
    }
  }

  const letter = (shopInfo.name || '?').trim().charAt(0).toUpperCase() || '?';
  const colour = /^#[0-9a-f]{3,8}$/i.test(theme.primaryColor || '') ? theme.primaryColor : '#111111';
  const tile = new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: colour, color: '#ffffff', fontSize: 120, fontWeight: 700, borderRadius: 36,
        }}
      >
        {letter}
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
  return new Response(tile.body, { headers: { 'Content-Type': 'image/png', ...HEADERS } });
}
