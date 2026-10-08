import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

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

  // Where new-order and new-lead alerts go; empty clears it (alerts then go to
  // every owner).
  @ApiPropertyOptional() @ValidateIf((_, v) => v !== '' && v !== null) @IsOptional() @IsEmail() notificationEmail?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1000000) deliveryFeeKes?: number;
  // null clears it (no free-delivery threshold).
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100000000) freeDeliveryOverKes?: number | null;
}
