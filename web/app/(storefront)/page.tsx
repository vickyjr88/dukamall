import { getProducts, getShopInfo } from '@/app/lib/api';
import { ProductCard } from '@/app/product-card';

export default async function HomePage() {
  const [products, shopInfo] = await Promise.all([getProducts(), getShopInfo()]);

  return (
    <main>
      <section className="shop-hero">
        <div className="shop-hero-content">
          <span className="eyebrow">New arrivals</span>
          <h1>{shopInfo.name}</h1>
          <p>Shop the latest drop -- new pieces added regularly, while stock lasts.</p>
          <a href="#catalog" className="btn btn-primary">Shop now</a>
        </div>
      </section>

      <section className="shop-section" id="catalog">
        <div className="shop-container">
          <div className="shop-section-head">
            <div>
              <span className="eyebrow">Full catalog</span>
              <h2>All products</h2>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="empty-state">
              <h3>Nothing here yet</h3>
              <p>Check back soon -- new products are added regularly.</p>
            </div>
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
