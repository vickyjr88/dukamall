import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDecimal, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class VariantInputDto {
  @ApiProperty() @IsString() @IsNotEmpty() sku!: string;
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() size?: string;
  @ApiProperty() priceKes!: number;
  @ApiPropertyOptional() @IsOptional() wasPriceKes?: number;
  @ApiProperty({ example: 0 }) @IsInt() @Min(0) stockOnHand!: number;
}

export class CreateProductDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() slug!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() imageUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;

  @ApiProperty({ type: [VariantInputDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => VariantInputDto)
  variants!: VariantInputDto[];
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() imageUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
}

export class UpdateVariantDto {
  @ApiPropertyOptional() @IsOptional() priceKes?: number;
  @ApiPropertyOptional() @IsOptional() wasPriceKes?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
