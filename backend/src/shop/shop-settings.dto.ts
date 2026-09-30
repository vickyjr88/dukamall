import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateShopSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() whatsappNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paystackSecretKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paystackPublicKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['KES', 'UGX', 'TZS', 'USD']) currency?: string;
  // Short, uppercase, alphanumeric -- prefixed onto every order number
  // (Order.orderNumber), so anything longer or containing separators would
  // make order numbers unwieldy on a receipt or a WhatsApp message.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{2,8}$/, { message: 'orderPrefix must be 2-8 uppercase letters/numbers' })
  orderPrefix?: string;
}
