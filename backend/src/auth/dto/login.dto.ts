import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() password!: string;

  // Which shop this staff member is logging into. A person with UserShop rows
  // in two shops picks one at login; switching shops means logging in again
  // (or, once built, a shop-switcher that re-mints the token) -- there is no
  // multi-shop token, on purpose, since every downstream query trusts a
  // single shopId claim.
  @ApiProperty() @IsString() @IsNotEmpty() shopSlug!: string;
}
