import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

// "" and null both mean "clear this field"; undefined means "leave it alone".
// Everything optional below uses this so an emptied input in the portal form
// actually removes the value rather than being rejected by the validators.
const present = (_: unknown, v: unknown) => v !== '' && v !== null;

const HTTP_URL = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

export const FONT_PAIRING_KEYS = ['fraunces-manrope', 'playfair-inter', 'poppins-only', 'dm-serif-work', 'unbounded-sans'];
export const LAYOUT_PRESET_KEYS = ['sharp', 'soft'];

/** What a shop owner edits under "Store info" -- the words and links around the catalogue. */
export class UpdateStorefrontDto {
  // Required when present: a shop with no name has nothing to put in the header.
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) tagline?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) announcement?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) seoDescription?: string | null;
  @ApiPropertyOptional() @ValidateIf(present) @IsOptional() @IsEmail() @MaxLength(120) contactEmail?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) contactPhone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) address?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) openingHours?: string | null;
  // http(s) only: these become <a href> on every page of the storefront, so a
  // javascript: URL here would be stored XSS.
  @ApiPropertyOptional() @ValidateIf(present) @IsOptional() @IsUrl(HTTP_URL) @MaxLength(300) instagramUrl?: string | null;
  @ApiPropertyOptional() @ValidateIf(present) @IsOptional() @IsUrl(HTTP_URL) @MaxLength(300) facebookUrl?: string | null;
  @ApiPropertyOptional() @ValidateIf(present) @IsOptional() @IsUrl(HTTP_URL) @MaxLength(300) tiktokUrl?: string | null;
}

const HEX = { regex: /^#[0-9a-fA-F]{6}$/, message: 'must be a 6-digit hex color like #2438a8' };

/**
 * The theme body, spelled out. It used to be an untyped Record passed straight
 * to Prisma, so a request could also set shopId/id on the theme row.
 */
export class UpdateThemeDto {
  // Hex-only: injected as raw CSS by the storefront's theme injector.
  @ApiPropertyOptional() @IsOptional() @Matches(HEX.regex, { message: `primaryColor ${HEX.message}` }) primaryColor?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(HEX.regex, { message: `accentColor ${HEX.message}` }) accentColor?: string;
  @ApiPropertyOptional() @ValidateIf(present) @IsOptional() @IsUrl(HTTP_URL) @MaxLength(500) logoUrl?: string | null;
  @ApiPropertyOptional() @ValidateIf(present) @IsOptional() @IsUrl(HTTP_URL) @MaxLength(500) heroImageUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) heroEyebrow?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) heroHeadline?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) heroSubtitle?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) heroButtonLabel?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsIn(FONT_PAIRING_KEYS) fontPairing?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(LAYOUT_PRESET_KEYS) layoutPreset?: string;
}
