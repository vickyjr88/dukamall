import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { ShopModule } from '../shop/shop.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    }),
    ShopModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminJwtGuard],
})
export class AdminModule {}
