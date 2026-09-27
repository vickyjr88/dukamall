import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CustomerAuthModule } from './customer-auth/customer-auth.module';
import { CustomerAccountModule } from './customer-account/customer-account.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { ShopScopeGuard } from './common/shop-scope.guard';
import { ShopModule } from './shop/shop.module';
import { StorefrontModule } from './storefront/storefront.module';
import { ProductFeedModule } from './product-feed/product-feed.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaystackModule } from './paystack/paystack.module';
import { CartLeadModule } from './cart-lead/cart-lead.module';
import { MediaModule } from './media/media.module';
import { ReportsModule } from './reports/reports.module';
import { PortalProductModule } from './portal-product/portal-product.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CustomerAuthModule,
    CustomerAccountModule,
    ShopModule,
    StorefrontModule,
    ProductFeedModule,
    PaystackModule,
    CheckoutModule,
    CartLeadModule,
    MediaModule,
    ReportsModule,
    PortalProductModule,
    OnboardingModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: JwtAuthGuard runs first and populates request.user for
    // any route that isn't @Public(), then ShopScopeGuard reads either that
    // user's shopId claim or the x-shop-id header. Nest runs APP_GUARD
    // providers in registration order.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ShopScopeGuard },
  ],
})
export class AppModule {}
