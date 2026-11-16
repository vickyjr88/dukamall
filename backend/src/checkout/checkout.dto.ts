import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

const blankToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

export class CheckoutLineDto {
  @ApiProperty() @IsString() @IsNotEmpty() variantId!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) quantity!: number;
}

export class CheckoutDto {
  @ApiProperty({ type: [CheckoutLineDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CheckoutLineDto)
  lines!: CheckoutLineDto[];

  @ApiProperty() @IsString() @IsNotEmpty() firstName!: string;
  @ApiProperty() @IsString() @IsNotEmpty() lastName!: string;
  // A blank field is the same as none: the cart form sends "" for a box left empty, which is not a (bad) email address.
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @Transform(blankToUndefined) @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shippingAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() discountCode?: string;
  /** The browsing session (see StorefrontEvent): how an order is traced back to the ad that brought the shopper. */
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9]{12,40}$/) sessionId?: string;
}
