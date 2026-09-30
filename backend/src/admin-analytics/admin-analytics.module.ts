import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminJwtGuard } from '../admin-auth/admin-jwt.guard';

// Same self-contained JwtModule + AdminJwtGuard provider pattern as
// AdminModule -- AdminJwtGuard needs its own JwtService instance in
// whichever module provides it, since it isn't exported anywhere globally.
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    }),
  ],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsService, AdminJwtGuard],
})
export class AdminAnalyticsModule {}
