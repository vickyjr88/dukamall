import { getShopInfo } from '@/app/lib/api';
import { CartClient } from './cart-client';

export default async function CartPage() {
  const shopInfo = await getShopInfo();
  return <CartClient shopInfo={shopInfo} />;
}
