import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

/** Blank (or absent) secrets are kept as they are; use `clear` to remove a field. Which keys are allowed is checked against the provider. */
export class SaveIntegrationDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional({ description: 'Ids and settings, by field key' }) @IsOptional() @IsObject() config?: Record<string, string>;
  @ApiPropertyOptional({ description: 'Tokens and secrets, by field key. Blank keeps what is stored.' }) @IsOptional() @IsObject() secrets?: Record<string, string>;
  @ApiPropertyOptional({ description: 'Field keys to remove' }) @IsOptional() @IsArray() @IsString({ each: true }) clear?: string[];
}
