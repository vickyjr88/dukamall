import Link from 'next/link';
import { getProducts } from '@/app/lib/api';

export default async function HomePage() {
  const products = await getProducts();

  return (
    <main className="shop-container">
      <h1>Shop the latest</h1>
      {products.length === 0 ? (
        <p>No products yet.</p>
      ) : (
        <div className="product-grid">
          {products.map((product) => {
            const firstVariant = product.variants[0];
            return (
              <Link key={product.id} href={`/shop/${product.slug}`} className="product-card">
                {product.imageUrls[0] ? <img src={product.imageUrls[0]} alt={product.name} /> : <div style={{ aspectRatio: '4/5', background: '#eee' }} />}
                <div className="body">
                  <div className="name">{product.name}</div>
                  {firstVariant ? <div className="price">KES {Number(firstVariant.priceKes).toLocaleString()}</div> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
