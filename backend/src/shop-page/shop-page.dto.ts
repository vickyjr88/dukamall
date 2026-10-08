import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateShopPageDto {
  @ApiPropertyOptional() @IsString() @MinLength(1) @MaxLength(80) title!: string;
  // Generated from the title when omitted.
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug may only contain lowercase letters, numbers and single hyphens' }) @MaxLength(60) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) body?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() published?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showInFooter?: boolean;
}

export class UpdateShopPageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(80) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug may only contain lowercase letters, numbers and single hyphens' }) @MaxLength(60) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) body?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() published?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showInFooter?: boolean;
}
