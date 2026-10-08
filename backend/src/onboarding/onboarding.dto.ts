import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotIn, IsString, Matches, MinLength } from 'class-validator';
import { RESERVED_SLUGS } from '../common/reserved-slugs';

export class CreateShopDto {
  @ApiProperty({ description: 'Shop name shown to customers' }) @IsString() shopName!: string;

  @ApiProperty({ description: 'Subdomain, e.g. "nairobigents" for nairobigents.dukamall.app' })
  @IsString()
  @Matches(/^[a-z0-9-]{3,40}$/, { message: 'Slug must be lowercase letters, numbers and hyphens only' })
  @IsNotIn([...RESERVED_SLUGS], { message: 'That shop address is reserved. Please choose another.' })
  slug!: string;

  @ApiProperty() @IsEmail() ownerEmail!: string;
  @ApiProperty() @IsString() ownerFirstName!: string;
  @ApiProperty() @IsString() ownerLastName!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
}
