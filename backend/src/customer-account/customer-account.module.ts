import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CustomerAccountService } from './customer-account.service';
import { CustomerAccountController } from './customer-account.controller';
import { CustomerJwtGuard } from '../customer-auth/customer-jwt.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    }),
  ],
  controllers: [CustomerAccountController],
  providers: [CustomerAccountService, CustomerJwtGuard],
})
export class CustomerAccountModule {}
