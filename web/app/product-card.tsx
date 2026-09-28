import Link from 'next/link';
import { ShopProduct } from './lib/api';

function currentPrice(product: ShopProduct) {
  const inStock = product.variants.find((v) => v.stockOnHand > 0) ?? product.variants[0];
  return inStock ?? null;
}

export function ProductCard({ product }: { product: ShopProduct }) {
  const variant = currentPrice(product);
  const isOnSale = variant?.wasPriceKes && Number(variant.wasPriceKes) > Number(variant.priceKes);
  const isSoldOut = product.variants.length > 0 && product.variants.every((v) => v.stockOnHand <= 0);

  return (
    <Link href={`/shop/${product.slug}`} className="product-card">
      <div className="product-card-media">
        {product.imageUrls[0] ? (
          <img src={product.imageUrls[0]} alt={product.name} loading="lazy" />
        ) : (
          <div className="product-card-placeholder">{product.name.charAt(0)}</div>
        )}
        {isSoldOut ? (
          <span className="product-card-badge">Sold out</span>
        ) : isOnSale ? (
          <span className="product-card-badge is-sale">Sale</span>
        ) : null}
      </div>
      <div className="name">{product.name}</div>
      {variant ? (
        <div className="price">
          {isOnSale ? <span className="was">KES {Number(variant.wasPriceKes).toLocaleString()}</span> : null}
          KES {Number(variant.priceKes).toLocaleString()}
        </div>
      ) : null}
    </Link>
  );
}
