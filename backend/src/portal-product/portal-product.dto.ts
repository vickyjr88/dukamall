import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Matches,
  MaxLength, Min, ValidateNested,
} from 'class-validator';

// Letters, digits and a few separators -- a SKU ends up in the product feed's
// id column, CSV import/export and WhatsApp messages, so whitespace and
// quoting characters are more trouble than they're worth.
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

export class VariantInputDto {
  /** Set when this row is an existing variant being edited; absent for a new one. */
  @ApiPropertyOptional() @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(64) @Matches(SKU_PATTERN, { message: 'SKU may only contain letters, numbers and . _ - /' }) sku!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) size?: string;
  /** Kept optional for older callers; the server derives "<product> - <size>" when it is missing. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(250) name?: string;
  @ApiProperty() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) priceKes!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) wasPriceKes?: number | null;
  /** On an edit, leave this out to leave stock untouched -- see PortalProductService.syncVariants. */
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @IsInt() @Min(0) stockOnHand?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProductDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  /** Generated from the name (and made unique) when left out. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(12)
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true }, { each: true })
  imageUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiProperty({ type: [VariantInputDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => VariantInputDto)
  variants!: VariantInputDto[];
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) brand?: string;
  /** null clears the category; leaving it out leaves it as is. */
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string | null;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(12)
  @IsUrl({ require_tld: false, protocols: ['http', 'https'], require_protocol: true }, { each: true })
  imageUrls?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SyncVariantsDto {
  @ApiProperty({ type: [VariantInputDto] })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => VariantInputDto)
  variants!: VariantInputDto[];
}

export class UpdateVariantDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) priceKes?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) wasPriceKes?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
