import Link from 'next/link';
import { ShopInfo, ShopPageLink } from '@/app/lib/api';
import { WhatsAppIcon } from '@/app/whatsapp-icon';
import { FacebookIcon, InstagramIcon, TikTokIcon, XIcon } from '@/app/social-icons';

export function StorefrontFooter({ shopInfo, pages }: { shopInfo: ShopInfo; pages: ShopPageLink[] }) {
  const year = new Date().getFullYear();
  const footerPages = pages.filter((p) => p.showInFooter);
  const socials = [
    { label: 'Instagram', href: shopInfo.instagramUrl, Icon: InstagramIcon },
    { label: 'Facebook', href: shopInfo.facebookUrl, Icon: FacebookIcon },
    { label: 'TikTok', href: shopInfo.tiktokUrl, Icon: TikTokIcon },
    { label: 'X', href: shopInfo.xUrl, Icon: XIcon },
  ].filter((s): s is { label: string; href: string; Icon: typeof XIcon } => Boolean(s.href));
  const blurb = shopInfo.tagline
    || (shopInfo.whatsappNumber ? 'Questions about an order or a size? Message us any time.' : 'Thank you for shopping with us.');

  return (
    <footer className="shop-footer">
      <div className="shop-container">
        <div className="shop-footer-grid">
          <div>
            <div className="logo">{shopInfo.name}</div>
            <p style={{ color: 'var(--shop-muted)', fontSize: 'var(--shop-text-sm)', maxWidth: '32ch' }}>{blurb}</p>
            {socials.length > 0 ? (
              <ul className="shop-footer-socials" aria-label="Follow us">
                {socials.map(({ label, href, Icon }) => (
                  <li key={label}>
                    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${shopInfo.name} on ${label}`} title={label}>
                      <Icon />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="shop-footer-col">
            <h4>Shop</h4>
            <ul>
              <li><Link href="/">All products</Link></li>
              <li><Link href="/cart">Cart</Link></li>
              <li><Link href="/account">My account</Link></li>
              {/* Plain links: the portal and the admin console are separate apps with their own layouts and sign-in. */}
              <li><a href="/portal/login">Merchant portal</a></li>
              <li><a href="/admin/login">Admin login</a></li>
            </ul>
          </div>
          {footerPages.length > 0 ? (
            <div className="shop-footer-col">
              <h4>Information</h4>
              <ul>
                {footerPages.map((page) => <li key={page.slug}><Link href={`/pages/${page.slug}`}>{page.title}</Link></li>)}
              </ul>
            </div>
          ) : null}
          <div className="shop-footer-col">
            <h4>Get in touch</h4>
            <ul>
              {shopInfo.whatsappNumber ? (
                <li>
                  <a
                    href={`https://wa.me/${shopInfo.whatsappNumber.replace(/[^\d]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <WhatsAppIcon /> WhatsApp us
                  </a>
                </li>
              ) : null}
              {shopInfo.contactPhone ? <li><a href={`tel:${shopInfo.contactPhone.replace(/[^\d+]/g, '')}`}>{shopInfo.contactPhone}</a></li> : null}
              {shopInfo.contactEmail ? <li><a href={`mailto:${shopInfo.contactEmail}`}>{shopInfo.contactEmail}</a></li> : null}
              {shopInfo.address ? <li className="shop-footer-text">{shopInfo.address}</li> : null}
              {shopInfo.openingHours ? <li className="shop-footer-text">{shopInfo.openingHours}</li> : null}
            </ul>
          </div>
        </div>
        <div className="shop-footer-bottom">
          <span>&copy; {year} {shopInfo.name}. All rights reserved.</span>
          <span>Powered by Shops Platform</span>
        </div>
      </div>
    </footer>
  );
}
