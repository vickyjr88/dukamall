import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformSettingsController } from './platform-settings.controller';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';
import { EmailModule } from '../email/email.module';

// Same self-contained JwtModule + AdminJwtGuard provider pattern as
// AdminModule/AdminAnalyticsModule -- AdminJwtGuard needs a JwtService
// instance in whichever module provides it.
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    }),
    EmailModule,
  ],
  controllers: [PlatformSettingsController],
  providers: [PlatformSettingsService, AdminJwtGuard],
})
export class PlatformSettingsModule {}
