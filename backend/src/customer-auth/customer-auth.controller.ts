import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { CustomerAuthService } from './customer-auth.service';
import { Public } from '../auth/decorators/public.decorator';
import { ShopId } from '../common/shop-context';
import { RateLimit } from '../common/rate-limit.decorator';

class CustomerRegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
}

class CustomerLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

@ApiTags('customer-auth')
@Controller('customer-auth')
export class CustomerAuthController {
  constructor(private customerAuth: CustomerAuthService) {}

  @Public()
  @RateLimit(5, 60)
  @Post('register')
  register(@ShopId() shopId: string, @Body() dto: CustomerRegisterDto) {
    return this.customerAuth.register(shopId, dto.email, dto.password, dto.firstName, dto.lastName);
  }

  @Public()
  @RateLimit(10, 60)
  @Post('login')
  login(@ShopId() shopId: string, @Body() dto: CustomerLoginDto) {
    return this.customerAuth.login(shopId, dto.email, dto.password);
  }
}
