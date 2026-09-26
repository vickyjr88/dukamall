import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateShopSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() whatsappNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paystackSecretKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paystackPublicKey?: string;
}
