import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';

export class CartLeadLineDto {
  // Optional: a customer-typed size with no matching variant ("My size isn't
  // listed") has no real variantId to report -- see drip-crm's own
  // CartLeadLineDto, which this mirrors after that exact gap was found and
  // fixed there this session.
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() size!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) quantity!: number;
  @ApiProperty() @IsInt() @Min(0) priceKes!: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCustomSize?: boolean;
}

export class RecordCartLeadDto {
  @ApiProperty({ enum: ['WHATSAPP_ORDER', 'ABANDONED_CART'] })
  @IsIn(['WHATSAPP_ORDER', 'ABANDONED_CART'])
  source!: 'WHATSAPP_ORDER' | 'ABANDONED_CART';

  @ApiProperty({ type: [CartLeadLineDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CartLeadLineDto)
  lines!: CartLeadLineDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() customerEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shippingAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
}
