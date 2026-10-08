import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { ShopModule } from '../shop/shop.module';
import { EmailModule } from '../email/email.module';
import { MediaModule } from '../media/media.module';
import { PasswordResetModule } from '../password-reset/password-reset.module';
import { PlatformHealthService } from './platform-health.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    }),
    ShopModule,
    EmailModule,
    MediaModule,
    PasswordResetModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminJwtGuard, PlatformHealthService],
})
export class AdminModule {}
