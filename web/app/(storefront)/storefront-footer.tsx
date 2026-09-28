import Link from 'next/link';
import { ShopInfo } from '@/app/lib/api';

export function StorefrontFooter({ shopInfo }: { shopInfo: ShopInfo }) {
  const year = new Date().getFullYear();

  return (
    <footer className="shop-footer">
      <div className="shop-container">
        <div className="shop-footer-grid">
          <div>
            <div className="logo">{shopInfo.name}</div>
            <p style={{ color: 'var(--shop-muted)', fontSize: 'var(--shop-text-sm)', maxWidth: '32ch' }}>
              {shopInfo.whatsappNumber
                ? `Questions about an order or a size? Message us any time.`
                : `Thank you for shopping with us.`}
            </p>
          </div>
          <div className="shop-footer-col">
            <h4>Shop</h4>
            <ul>
              <li><Link href="/">All products</Link></li>
              <li><Link href="/cart">Cart</Link></li>
              <li><Link href="/account">My account</Link></li>
            </ul>
          </div>
          <div className="shop-footer-col">
            <h4>Get in touch</h4>
            <ul>
              {shopInfo.whatsappNumber ? (
                <li>
                  <a href={`https://wa.me/${shopInfo.whatsappNumber.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">
                    WhatsApp us
                  </a>
                </li>
              ) : null}
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
